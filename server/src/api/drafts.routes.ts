import type { FastifyInstance } from "fastify";
import { draftsRepository } from "../persistence/drafts.repository.js";
import { validateRecipe } from "../domain/validation/validation.engine.js";
import { decideSave } from "../domain/save-decision.js";
import { recipesRepository } from "../persistence/recipes.repository.js";
import { v4 as uuidv4 } from "uuid";
import type {
  ParsedRecipeCandidate,
  EditedRecipeCandidate,
  ValidationResult,
  SourcePage,
} from "@recipejar/shared";
import { URL_IMPORT_HTML_MAX_BYTES } from "@recipejar/shared";
import { parseImages } from "../parsing/image/image-parse.adapter.js";
import {
  parseUrl,
  parseUrlFromHtml,
  type UrlAcquisitionMethod,
} from "../parsing/url/url-parse.adapter.js";
import { logEvent } from "../observability/event-logger.js";
import { optimizeForUpload, optimizeForOcr } from "../parsing/image/image-optimizer.js";
import { getSupabase } from "../services/supabase.js";
import {
  copyFromDraftPage,
  downloadAndStoreFromUrl,
  RECIPE_PAGES_BUCKET,
  resolveImageUrls,
} from "../services/recipe-image.service.js";

const URL_PARSE_CAPTURE_FAILURE_REASONS = new Set([
  "injection_failed",
  "capture_timeout",
  "page_not_ready",
  "payload_too_large",
  "message_transport_failed",
]);

type DraftRow = NonNullable<Awaited<ReturnType<typeof draftsRepository.findById>>>;

/** Map persistence JSON columns to shared `RecipeDraft` field names for the mobile client. */
function draftRowToClientFields(row: DraftRow) {
  const {
    parsedCandidateJson,
    editedCandidateJson,
    validationResultJson,
    ...rest
  } = row;
  return {
    ...rest,
    parsedCandidate: (parsedCandidateJson ?? null) as ParsedRecipeCandidate | null,
    editedCandidate: (editedCandidateJson ?? null) as EditedRecipeCandidate | null,
    validationResult: (validationResultJson ?? null) as ValidationResult | null,
  };
}

function draftRowToClientBody(
  row: DraftRow,
  pages: Awaited<ReturnType<typeof draftsRepository.getPages>>,
  warningStates: Awaited<ReturnType<typeof draftsRepository.getWarningStates>>,
) {
  return { ...draftRowToClientFields(row), pages, warningStates };
}

export async function draftsRoutes(app: FastifyInstance) {
  app.post("/drafts", async (request, reply) => {
    const draft = await draftsRepository.create({ sourceType: "image" });
    logEvent("draft_created", { draftId: draft.id, sourceType: "image" });
    return reply.status(201).send(draft);
  });

  app.post("/drafts/url", async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) {
      return reply.status(400).send({ error: "url is required" });
    }
    const draft = await draftsRepository.create({
      sourceType: "url",
      originalUrl: url,
    });
    logEvent("draft_created", { draftId: draft.id, sourceType: "url" });
    return reply.status(201).send(draft);
  });

  app.post<{ Params: { draftId: string } }>(
    "/drafts/:draftId/pages",
    async (request, reply) => {
      const { draftId } = request.params;
      const draft = await draftsRepository.findById(draftId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Image file is required" });
      }

      const existingPages = await draftsRepository.getPages(draftId);
      const orderIndex = existingPages.length;
      const pageId = uuidv4();
      const storagePath = `${draftId}/${pageId}.jpg`;

      const rawBuffer = await file.toBuffer();
      const buffer = await optimizeForUpload(rawBuffer);
      const { error: uploadError } = await getSupabase().storage
        .from(RECIPE_PAGES_BUCKET)
        .upload(storagePath, buffer, { contentType: "image/jpeg" });

      if (uploadError) {
        return reply.status(500).send({ error: "Failed to upload image" });
      }

      try {
        const page = await draftsRepository.addPage({
          draftId,
          orderIndex,
          imageUri: storagePath,
        });
        logEvent("page_added", { draftId, pageId: page.id, pageCount: orderIndex + 1 });
        return reply.status(201).send(page);
      } catch (dbError) {
        await getSupabase().storage.from(RECIPE_PAGES_BUCKET).remove([storagePath]);
        throw dbError;
      }
    },
  );

  app.patch<{ Params: { draftId: string } }>(
    "/drafts/:draftId/pages/reorder",
    async (request, reply) => {
      const { draftId } = request.params;
      const { pageOrder } = request.body as {
        pageOrder: { pageId: string; orderIndex: number }[];
      };
      await draftsRepository.reorderPages(draftId, pageOrder);
      logEvent("pages_reordered", { draftId, pageCount: pageOrder.length });
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { draftId: string; pageId: string } }>(
    "/drafts/:draftId/retake/:pageId",
    async (request, reply) => {
      const { draftId, pageId } = request.params;
      const existingPage = await draftsRepository.findPageById(pageId);
      if (!existingPage) {
        return reply.status(404).send({ error: "Page not found" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Image file is required" });
      }

      const storagePath = `${draftId}/${pageId}.jpg`;
      const rawBuffer = await file.toBuffer();
      const buffer = await optimizeForUpload(rawBuffer);

      await getSupabase().storage.from(RECIPE_PAGES_BUCKET).remove([storagePath]);
      const { error: uploadError } = await getSupabase().storage
        .from(RECIPE_PAGES_BUCKET)
        .upload(storagePath, buffer, { contentType: "image/jpeg" });

      if (uploadError) {
        return reply.status(500).send({ error: "Failed to upload retake image" });
      }

      const updated = await draftsRepository.retakePage(pageId, storagePath);
      logEvent("retake_submitted", { draftId, pageId, retakeCount: updated.retakeCount });
      return reply.send(updated);
    },
  );

  app.post<{ Params: { draftId: string } }>(
    "/drafts/:draftId/parse",
    async (request, reply) => {
      const { draftId } = request.params;
      const parseBody = (request.body ?? {}) as {
        html?: string;
        acquisitionMethod?: UrlAcquisitionMethod;
        captureFailureReason?: string;
      };
      const suppliedHtml =
        typeof parseBody.html === "string" ? parseBody.html.trim() : "";
      const draft = await draftsRepository.findById(draftId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }

      if (
        draft.sourceType === "url" &&
        suppliedHtml &&
        Buffer.byteLength(suppliedHtml, "utf8") > URL_IMPORT_HTML_MAX_BYTES
      ) {
        return reply.status(413).send({ error: "Captured page is too large to import." });
      }

      await draftsRepository.updateStatus(draftId, "PARSING");
      logEvent("parse_started", { draftId, sourceType: draft.sourceType });

      const pages = await draftsRepository.getPages(draftId);
      const sourcePages: SourcePage[] = pages.map((p) => ({
        id: p.id,
        orderIndex: p.orderIndex,
        sourceType: draft.sourceType as "image" | "url",
        retakeCount: p.retakeCount,
        imageUri: p.imageUri,
        extractedText: p.ocrText,
      }));

      let candidate: ParsedRecipeCandidate;

      if (draft.sourceType === "url" && draft.originalUrl) {
        if (suppliedHtml) {
          candidate = await parseUrlFromHtml(
            draft.originalUrl,
            suppliedHtml,
            sourcePages,
            "webview-html",
          );
        } else {
          const acquisitionMethod: UrlAcquisitionMethod =
            parseBody.acquisitionMethod === "server-fetch-fallback"
              ? "server-fetch-fallback"
              : "server-fetch";

          if (
            acquisitionMethod === "server-fetch-fallback" &&
            typeof parseBody.captureFailureReason === "string" &&
            URL_PARSE_CAPTURE_FAILURE_REASONS.has(parseBody.captureFailureReason)
          ) {
            logEvent("url_parse_capture_failed", {
              draftId,
              reason: parseBody.captureFailureReason,
            });
          }

          candidate = await parseUrl(draft.originalUrl, sourcePages, acquisitionMethod);
        }
      } else {
        const imageDataUrls = await Promise.all(
          pages.map(async (page) => {
            try {
              const { data, error } = await getSupabase().storage
                .from(RECIPE_PAGES_BUCKET)
                .download(page.imageUri);
              if (error || !data) throw new Error(error?.message ?? "Download returned no data");
              const rawBuffer = Buffer.from(await data.arrayBuffer());
              const optimized = await optimizeForOcr(rawBuffer);
              const b64 = optimized.toString("base64");
              return `data:image/jpeg;base64,${b64}`;
            } catch (err) {
              console.warn(`[parse] OCR optimization failed for ${page.imageUri}, falling back to public URL:`, err);
              const { data: urlData } = getSupabase().storage
                .from(RECIPE_PAGES_BUCKET)
                .getPublicUrl(page.imageUri);
              return urlData.publicUrl;
            }
          })
        );
        candidate = await parseImages(imageDataUrls, sourcePages);
      }

      if (draft.sourceType === "url" && draft.originalUrl) {
        logEvent("url_parse_source_selected", {
          draftId,
          acquisitionMethod: suppliedHtml
            ? "webview-html"
            : parseBody.acquisitionMethod === "server-fetch-fallback"
              ? "server-fetch-fallback"
              : "server-fetch",
        });
      }

      const validationResult = validateRecipe(candidate);

      await draftsRepository.setParsedCandidate(
        draftId,
        candidate,
        validationResult,
      );

      const flags = validationResult.issues.filter(
        (i) => i.severity === "FLAG",
      );
      if (flags.length > 0) {
        await draftsRepository.upsertWarningStates(
          draftId,
          flags.map((f) => ({
            issueId: f.issueId,
            code: f.code,
            fieldPath: f.fieldPath,
          })),
        );
      }

      logEvent("parse_completed", { draftId, sourceType: draft.sourceType, pageCount: pages.length });
      logEvent("validation_completed", {
        draftId,
        issueCountBlock: validationResult.issues.filter((i) => i.severity === "BLOCK").length,
        issueCountFlag: validationResult.issues.filter((i) => i.severity === "FLAG").length,
        issueCountRetake: validationResult.issues.filter((i) => i.severity === "RETAKE").length,
      });

      const nextStatus = validationResult.requiresRetake ? "NEEDS_RETAKE" : "PARSED";
      await draftsRepository.updateStatus(draftId, nextStatus);

      return reply.send({
        status: nextStatus,
        candidate,
        validationResult,
      });
    },
  );

  app.patch<{ Params: { draftId: string } }>(
    "/drafts/:draftId/candidate",
    async (request, reply) => {
      const { draftId } = request.params;
      const draft = await draftsRepository.findById(draftId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }

      const editedCandidate = request.body as EditedRecipeCandidate;
      const parsedCandidate = draft.parsedCandidateJson as unknown as ParsedRecipeCandidate | null;
      if (!parsedCandidate) {
        return reply.status(400).send({ error: "No parsed candidate to edit" });
      }

      const revalidationCandidate: ParsedRecipeCandidate = {
        ...parsedCandidate,
        title: editedCandidate.title,
        ingredients: editedCandidate.ingredients.map((i) => ({
          id: i.id,
          text: i.text,
          orderIndex: i.orderIndex,
          isHeader: i.isHeader,
        })),
        steps: editedCandidate.steps.map((s) => ({
          id: s.id,
          text: s.text,
          orderIndex: s.orderIndex,
          isHeader: s.isHeader,
        })),
        description: editedCandidate.description,
      };

      const validationResult = validateRecipe(revalidationCandidate);
      const updated = await draftsRepository.updateEditedCandidate(
        draftId,
        editedCandidate,
        validationResult,
      );

      const flags = validationResult.issues.filter((i) => i.severity === "FLAG");
      if (flags.length > 0) {
        await draftsRepository.upsertWarningStates(
          draftId,
          flags.map((f) => ({
            issueId: f.issueId,
            code: f.code,
            fieldPath: f.fieldPath,
          })),
        );
      }

      return reply.send({
        draft: draftRowToClientFields(updated),
        validationResult,
      });
    },
  );

  app.post<{ Params: { draftId: string } }>(
    "/drafts/:draftId/dismiss-warning",
    async (request, reply) => {
      const { draftId } = request.params;
      const { issueId } = request.body as { issueId: string };
      const result = await draftsRepository.dismissWarning(draftId, issueId);
      if (!result) {
        return reply.status(404).send({ error: "Warning not found" });
      }
      logEvent("warning_dismissed", { draftId, issueId });
      return reply.send(result);
    },
  );

  app.post<{ Params: { draftId: string } }>(
    "/drafts/:draftId/undismiss-warning",
    async (request, reply) => {
      const { draftId } = request.params;
      const { issueId } = request.body as { issueId: string };
      const result = await draftsRepository.undismissWarning(draftId, issueId);
      if (!result) {
        return reply.status(404).send({ error: "Warning not found" });
      }
      return reply.send(result);
    },
  );

  app.get<{ Params: { draftId: string } }>(
    "/drafts/:draftId",
    async (request, reply) => {
      const { draftId } = request.params;
      const draft = await draftsRepository.findById(draftId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }
      const pages = await draftsRepository.getPages(draftId);
      const warningStates = await draftsRepository.getWarningStates(draftId);
      return reply.send(draftRowToClientBody(draft, pages, warningStates));
    },
  );

  app.post<{ Params: { draftId: string } }>(
    "/drafts/:draftId/save",
    async (request, reply) => {
      const { draftId } = request.params;
      const draft = await draftsRepository.findById(draftId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }

      const validationResult = draft.validationResultJson as unknown as ValidationResult | null;
      if (!validationResult) {
        return reply.status(400).send({ error: "Draft has not been validated" });
      }

      const warningStates = await draftsRepository.getWarningStates(draftId);
      const dismissedIssueIds = warningStates
        .filter((w) => w.dismissed)
        .map((w) => w.issueId);

      const saveDecision = decideSave({
        validationResult,
        dismissedIssueIds,
      });

      if (!saveDecision.allowed) {
        return reply.status(422).send({
          error: "Recipe cannot be saved in current state",
          saveDecision,
        });
      }

      const edited = draft.editedCandidateJson as unknown as {
        title: string;
        ingredients: { text: string; orderIndex: number; isHeader: boolean }[];
        steps: { text: string; orderIndex: number; isHeader: boolean }[];
        description?: string | null;
      };
      const parsedCandidate = draft.parsedCandidateJson as ParsedRecipeCandidate | null;

      const pages = await draftsRepository.getPages(draftId);

      const recipe = await recipesRepository.save({
        title: edited.title,
        description: edited.description,
        sourceType: draft.sourceType as "image" | "url",
        originalUrl: draft.originalUrl,
        imageUrl: null,
        saveDecision,
        ingredients: edited.ingredients,
        steps: edited.steps,
        sourcePages: pages.map((p) => ({
          orderIndex: p.orderIndex,
          imageUri: p.imageUri,
          extractedText: p.ocrText,
        })),
      });
      let resolvedRecipe = {
        ...recipe,
        ...resolveImageUrls(recipe.imageUrl ?? null),
      };

      try {
        let imagePath: string | null = null;
        if (draft.sourceType === "url") {
          const metadataImageUrl = parsedCandidate?.metadata?.imageUrl;
          if (metadataImageUrl) {
            imagePath = await downloadAndStoreFromUrl(recipe.id, metadataImageUrl);
          }
        } else {
          const firstPage = pages.find((p) => p.orderIndex === 0);
          if (firstPage?.imageUri) {
            imagePath = await copyFromDraftPage(recipe.id, firstPage.imageUri);
          }
        }

        if (imagePath) {
          const updated = await recipesRepository.setImage(recipe.id, imagePath);
          if (updated) {
            resolvedRecipe = {
              ...resolvedRecipe,
              ...updated,
              ...resolveImageUrls(imagePath),
            };
          }
        }
      } catch (err) {
        request.log.warn({ err, draftId }, "Failed to attach recipe hero image during save");
      }

      await draftsRepository.markSaved(draftId);

      logEvent("recipe_saved", {
        draftId,
        recipeId: recipe.id,
        sourceType: draft.sourceType,
        saveState: saveDecision.saveState,
        warningsDismissed: dismissedIssueIds.length > 0,
      });

      return reply.status(201).send({ recipe: resolvedRecipe, saveDecision });
    },
  );
}
