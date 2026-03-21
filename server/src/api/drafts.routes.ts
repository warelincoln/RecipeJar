import type { FastifyInstance } from "fastify";
import { draftsRepository } from "../persistence/drafts.repository.js";
import { validateRecipe } from "../domain/validation/validation.engine.js";
import { decideSave } from "../domain/save-decision.js";
import { recipesRepository } from "../persistence/recipes.repository.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import type {
  ParsedRecipeCandidate,
  EditedRecipeCandidate,
  ValidationResult,
  SourcePage,
} from "@recipejar/shared";
import { parseImages } from "../parsing/image/image-parse.adapter.js";
import { parseUrl } from "../parsing/url/url-parse.adapter.js";
import { logEvent } from "../observability/event-logger.js";

const STORAGE_BUCKET = "recipe-pages";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    _supabase = createClient(url, key);
  }
  return _supabase;
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

      const buffer = await file.toBuffer();
      const { error: uploadError } = await getSupabase().storage
        .from(STORAGE_BUCKET)
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
        await getSupabase().storage.from(STORAGE_BUCKET).remove([storagePath]);
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
      const buffer = await file.toBuffer();

      await getSupabase().storage.from(STORAGE_BUCKET).remove([storagePath]);
      const { error: uploadError } = await getSupabase().storage
        .from(STORAGE_BUCKET)
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
      const draft = await draftsRepository.findById(draftId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
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
        candidate = await parseUrl(draft.originalUrl, sourcePages);
      } else {
        const imageUrls: string[] = [];
        for (const page of pages) {
          const { data } = getSupabase().storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(page.imageUri);
          imageUrls.push(data.publicUrl);
        }
        candidate = await parseImages(imageUrls, sourcePages);
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
        issueCountCorrectionRequired: validationResult.issues.filter((i) => i.severity === "CORRECTION_REQUIRED").length,
        issueCountFlag: validationResult.issues.filter((i) => i.severity === "FLAG").length,
        issueCountRetake: validationResult.issues.filter((i) => i.severity === "RETAKE").length,
      });

      let nextStatus: string;
      if (validationResult.requiresRetake) {
        nextStatus = "NEEDS_RETAKE";
      } else if (
        validationResult.hasBlockingIssues &&
        validationResult.canEnterCorrectionMode
      ) {
        nextStatus = "IN_GUIDED_CORRECTION";
      } else {
        nextStatus = "PARSED";
      }
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

      return reply.send({ draft: updated, validationResult });
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
      return reply.send({ ...draft, pages, warningStates });
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
        steps: { text: string; orderIndex: number }[];
        description?: string | null;
      };

      const pages = await draftsRepository.getPages(draftId);

      const recipe = await recipesRepository.save({
        title: edited.title,
        description: edited.description,
        sourceType: draft.sourceType as "image" | "url",
        originalUrl: draft.originalUrl,
        saveDecision,
        ingredients: edited.ingredients,
        steps: edited.steps,
        sourcePages: pages.map((p) => ({
          orderIndex: p.orderIndex,
          imageUri: p.imageUri,
          extractedText: p.ocrText,
        })),
      });

      await draftsRepository.markSaved(draftId);

      logEvent("recipe_saved", {
        draftId,
        recipeId: recipe.id,
        sourceType: draft.sourceType,
        saveState: saveDecision.saveState,
        warningsDismissed: dismissedIssueIds.length > 0,
      });

      return reply.status(201).send({ recipe, saveDecision });
    },
  );
}
