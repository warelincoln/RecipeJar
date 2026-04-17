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
  DraftStatus,
} from "@orzo/shared";
import { URL_IMPORT_HTML_MAX_BYTES } from "@orzo/shared";
import { parseImages } from "../parsing/image/image-parse.adapter.js";
import {
  parseUrl,
  parseUrlFromHtml,
  type UrlAcquisitionMethod,
} from "../parsing/url/url-parse.adapter.js";
import { logEvent } from "../observability/event-logger.js";
import { trackAnalytics, extractDomain } from "../observability/analytics.js";
import { optimizeForUpload, optimizeForOcr } from "../parsing/image/image-optimizer.js";
import { getSupabase } from "../services/supabase.js";
import {
  copyFromDraftPage,
  downloadAndStoreFromUrl,
  draftPagePathFor,
  RECIPE_PAGES_BUCKET,
  resolveImageUrls,
} from "../services/recipe-image.service.js";
import { acquireParseLock, releaseParseLock } from "../parsing/parse-semaphore.js";
import { isoDurationToMinutes } from "../parsing/time.js";

const PARSE_ALLOWED_STATUSES = new Set<DraftStatus>([
  "READY_FOR_PARSE",
  "CAPTURE_IN_PROGRESS",
  "NEEDS_RETAKE",
]);

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

/**
 * Rich properties for PostHog parse events. Shared between
 * server_parse_completed and server_parse_validated so the event feed has
 * consistent breakdowns (domain, extraction_method, save_state, etc.).
 */
function deriveParseEventProps(
  draft: DraftRow,
  candidate: ParsedRecipeCandidate,
  validationResult: ValidationResult | null,
  pageCount: number,
  elapsedMs: number,
  acquisitionMethod: UrlAcquisitionMethod | null,
): Record<string, string | number | boolean | null | string[]> {
  const sourceType = draft.sourceType;
  const extractionMethod =
    sourceType === "image" ? "vision" : (candidate.extractionMethod ?? "unknown");

  const blockCodes = (validationResult?.issues ?? [])
    .filter((i) => i.severity === "BLOCK")
    .map((i) => i.code);
  const retakeCodes = (validationResult?.issues ?? [])
    .filter((i) => i.severity === "RETAKE")
    .map((i) => i.code);
  const flagCodes = (validationResult?.issues ?? [])
    .filter((i) => i.severity === "FLAG")
    .map((i) => i.code);
  const hasFlags = flagCodes.length > 0;

  return {
    draft_id: draft.id,
    source_type: sourceType,
    url: draft.originalUrl ?? null,
    domain: extractDomain(draft.originalUrl),
    acquisition_method: acquisitionMethod,
    extraction_method: extractionMethod,
    page_count: pageCount,
    parse_duration_ms: elapsedMs,
    ingredient_count: candidate.ingredients?.length ?? 0,
    step_count: candidate.steps?.length ?? 0,
    had_title: Boolean(candidate.title && candidate.title.trim().length > 0),
    had_servings: candidate.servings != null,
    had_prep_time: Boolean(candidate.metadata?.prepTime),
    had_cook_time: Boolean(candidate.metadata?.cookTime),
    had_total_time: Boolean(candidate.metadata?.totalTime),
    save_state: validationResult?.saveState ?? null,
    has_blocking_issues: validationResult?.hasBlockingIssues ?? false,
    requires_retake: validationResult?.requiresRetake ?? false,
    block_codes: blockCodes,
    first_block_code: blockCodes[0] ?? null,
    retake_codes: retakeCodes,
    flag_codes: flagCodes,
    first_flag_code: flagCodes[0] ?? null,
    has_flags: hasFlags,
    block_count: blockCodes.length,
    retake_count: retakeCodes.length,
    flag_count: flagCodes.length,
  };
}

async function runParseInBackground(
  draftId: string,
  draft: DraftRow,
  suppliedHtml: string,
  parseBody: {
    html?: string;
    acquisitionMethod?: UrlAcquisitionMethod;
    captureFailureReason?: string;
  },
  startTime: number,
) {
  try {
    await acquireParseLock();

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
          trackAnalytics(
            "server_url_capture_failed",
            {
              draft_id: draftId,
              url: draft.originalUrl ?? null,
              domain: extractDomain(draft.originalUrl),
              acquisition_method: "server-fetch-fallback",
              reason: parseBody.captureFailureReason,
            },
            { userId: draft.userId },
          );
        }

        candidate = await parseUrl(draft.originalUrl, sourcePages, acquisitionMethod);
      }
    } else {
      const imageDataUrls = await Promise.all(
        pages.map(async (page) => {
          const { data, error } = await getSupabase().storage
            .from(RECIPE_PAGES_BUCKET)
            .download(page.imageUri);
          if (error || !data) throw new Error(error?.message ?? "Download returned no data");
          const rawBuffer = Buffer.from(await data.arrayBuffer());
          const optimized = await optimizeForOcr(rawBuffer);
          const b64 = optimized.toString("base64");
          return `data:image/jpeg;base64,${b64}`;
        }),
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
    const nextStatus = validationResult.requiresRetake ? "NEEDS_RETAKE" : "PARSED";

    const updated = await draftsRepository.setParsedCandidate(
      draftId,
      candidate,
      validationResult,
      nextStatus,
      "PARSING",
    );

    if (!updated) {
      console.warn(`[parse] Draft ${draftId} was cancelled during parse, skipping result write`);
      return;
    }

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

    const elapsed_ms = Date.now() - startTime;
    logEvent("parse_completed", { draftId, sourceType: draft.sourceType, pageCount: pages.length, elapsed_ms });
    logEvent("validation_completed", {
      draftId,
      issueCountBlock: validationResult.issues.filter((i) => i.severity === "BLOCK").length,
      issueCountFlag: validationResult.issues.filter((i) => i.severity === "FLAG").length,
      issueCountRetake: validationResult.issues.filter((i) => i.severity === "RETAKE").length,
    });

    const resolvedAcquisition: UrlAcquisitionMethod | null =
      draft.sourceType === "url"
        ? suppliedHtml
          ? "webview-html"
          : parseBody.acquisitionMethod === "server-fetch-fallback"
            ? "server-fetch-fallback"
            : "server-fetch"
        : null;

    const analyticsProps = deriveParseEventProps(
      draft,
      candidate,
      validationResult,
      pages.length,
      elapsed_ms,
      resolvedAcquisition,
    );
    trackAnalytics("server_parse_completed", analyticsProps, {
      userId: draft.userId,
    });
    trackAnalytics("server_parse_validated", analyticsProps, {
      userId: draft.userId,
    });
  } catch (err) {
    const elapsed_ms = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown parse error";
    console.error(`[parse] Background parse failed for draft ${draftId}:`, errorMessage);
    logEvent("parse_failed", { draftId, elapsed_ms, error: errorMessage });

    const errorStage = classifyParseError(errorMessage);
    trackAnalytics(
      "server_parse_failed",
      {
        draft_id: draftId,
        source_type: draft.sourceType,
        url: draft.originalUrl ?? null,
        domain: extractDomain(draft.originalUrl),
        acquisition_method:
          draft.sourceType === "url"
            ? suppliedHtml
              ? "webview-html"
              : parseBody.acquisitionMethod === "server-fetch-fallback"
                ? "server-fetch-fallback"
                : "server-fetch"
            : null,
        parse_duration_ms: elapsed_ms,
        error_message: errorMessage,
        error_stage: errorStage,
      },
      { userId: draft.userId },
    );

    await draftsRepository.setParseError(draftId, errorMessage, "PARSING");
  } finally {
    releaseParseLock();
  }
}

/**
 * Best-effort classification of parse failures for the PostHog error_stage
 * breakdown. Uses substring heuristics on the error message so new failure
 * modes fall through to "unknown" rather than breaking the dashboard.
 */
function classifyParseError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("fetch") || m.includes("timeout") || m.includes("ssrf")) return "fetch";
  if (m.includes("openai") || m.includes("vision")) return "vision";
  if (m.includes("json") || m.includes("parse") || m.includes("extract")) return "extract";
  if (m.includes("validate")) return "validate";
  return "unknown";
}

export async function draftsRoutes(app: FastifyInstance) {
  app.post("/drafts", {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 hour",
        keyGenerator: (request: any) => request.userId || request.ip,
      },
    },
  }, async (request, reply) => {
    const draft = await draftsRepository.create({ userId: request.userId, sourceType: "image" });
    logEvent("draft_created", { draftId: draft.id, sourceType: "image" });
    return reply.status(201).send(draft);
  });

  app.post("/drafts/url", {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 hour",
        keyGenerator: (request: any) => request.userId || request.ip,
      },
    },
  }, async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) {
      return reply.status(400).send({ error: "url is required" });
    }
    const draft = await draftsRepository.create({
      userId: request.userId,
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
      const draft = await draftsRepository.findById(draftId, request.userId);
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
      const storagePath = draftPagePathFor(request.userId, draftId, pageId);

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

      const storagePath = draftPagePathFor(request.userId, draftId, pageId);
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
    {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 hour",
          keyGenerator: (request: any) => request.userId || request.ip,
        },
      },
    },
    async (request, reply) => {
      const { draftId } = request.params;
      const parseBody = (request.body ?? {}) as {
        html?: string;
        acquisitionMethod?: UrlAcquisitionMethod;
        captureFailureReason?: string;
      };
      const suppliedHtml =
        typeof parseBody.html === "string" ? parseBody.html.trim() : "";
      const draft = await draftsRepository.findById(draftId, request.userId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }

      if (!PARSE_ALLOWED_STATUSES.has(draft.status as DraftStatus)) {
        logEvent("parse_rejected_idempotent", { draftId, currentStatus: draft.status });
        return reply.status(409).send({ error: "Parse not allowed in current state", status: draft.status });
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

      const startTime = Date.now();

      runParseInBackground(draftId, draft, suppliedHtml, parseBody, startTime);

      return reply.status(202).send({ status: "PARSING" });
    },
  );

  app.post<{ Params: { draftId: string } }>(
    "/drafts/:draftId/cancel",
    async (request, reply) => {
      const { draftId } = request.params;
      const draft = await draftsRepository.findById(draftId, request.userId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }

      await draftsRepository.updateStatus(draftId, "CANCELLED");

      const pages = await draftsRepository.getPages(draftId);
      const paths = pages.map((p) => p.imageUri).filter(Boolean);
      if (paths.length > 0) {
        await getSupabase().storage.from(RECIPE_PAGES_BUCKET).remove(paths);
      }

      logEvent("draft_cancelled", { draftId });
      return reply.send({ ok: true });
    },
  );

  app.patch<{ Params: { draftId: string } }>(
    "/drafts/:draftId/candidate",
    async (request, reply) => {
      const { draftId } = request.params;
      const draft = await draftsRepository.findById(draftId, request.userId);
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
          amount: i.amount ?? null,
          amountMax: i.amountMax ?? null,
          unit: i.unit ?? null,
          name: i.name ?? null,
          raw: i.raw ?? i.text,
          isScalable: i.isScalable ?? false,
        })),
        steps: editedCandidate.steps.map((s) => ({
          id: s.id,
          text: s.text,
          orderIndex: s.orderIndex,
          isHeader: s.isHeader,
        })),
        description: editedCandidate.description,
        servings: editedCandidate.servings ?? null,
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
      const existingDraft = await draftsRepository.findById(draftId, request.userId);
      if (!existingDraft) {
        return reply.status(404).send({ error: "Draft not found" });
      }
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
      const existingDraft = await draftsRepository.findById(draftId, request.userId);
      if (!existingDraft) {
        return reply.status(404).send({ error: "Draft not found" });
      }
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
      const draft = await draftsRepository.findById(draftId, request.userId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }
      const pages = await draftsRepository.getPages(draftId);
      const warningStates = await draftsRepository.getWarningStates(draftId);

      const supabase = getSupabase();
      const pagesWithUrls = await Promise.all(
        pages.map(async (p) => {
          const { data } = await supabase.storage
            .from(RECIPE_PAGES_BUCKET)
            .createSignedUrl(p.imageUri, 3600);
          return { ...p, resolvedImageUrl: data?.signedUrl ?? null };
        }),
      );

      return reply.send(draftRowToClientBody(draft, pagesWithUrls, warningStates));
    },
  );

  app.post<{ Params: { draftId: string } }>(
    "/drafts/:draftId/save",
    async (request, reply) => {
      const { draftId } = request.params;
      const draft = await draftsRepository.findById(draftId, request.userId);
      if (!draft) {
        return reply.status(404).send({ error: "Draft not found" });
      }

      if (draft.status === "SAVED") {
        return reply.status(409).send({ error: "Draft has already been saved" });
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

      const edited = draft.editedCandidateJson as unknown as EditedRecipeCandidate;
      const parsedCandidate = draft.parsedCandidateJson as ParsedRecipeCandidate | null;

      const baselineServings =
        edited.servings ?? parsedCandidate?.servings ?? null;

      // Time resolution order per field:
      //   1. User override in EditedRecipeCandidate (set via the times
      //      review banner on preview) → source "user_confirmed"
      //   2. Parsed metadata time (JSON-LD/Microdata → "explicit", or
      //      AI estimate → "inferred")
      //   3. null if neither is available
      //
      // If the user overrode the value — even to null — that wins.
      const resolveTime = (
        overrideKey: "prepTimeMinutes" | "cookTimeMinutes" | "totalTimeMinutes",
        parsedIsoKey: "prepTime" | "cookTime" | "totalTime",
        parsedSourceKey: "prepTimeSource" | "cookTimeSource" | "totalTimeSource",
      ): {
        minutes: number | null;
        source: "explicit" | "inferred" | "user_confirmed" | null;
      } => {
        if (overrideKey in edited) {
          const v = (edited as unknown as Record<string, unknown>)[overrideKey];
          const minutes = typeof v === "number" && v > 0 ? Math.round(v) : null;
          return { minutes, source: minutes != null ? "user_confirmed" : null };
        }
        const minutes = isoDurationToMinutes(
          parsedCandidate?.metadata?.[parsedIsoKey],
        );
        const parsedSource = parsedCandidate?.metadata?.[parsedSourceKey];
        return {
          minutes,
          source: minutes != null ? (parsedSource ?? null) : null,
        };
      };
      const prepTime = resolveTime("prepTimeMinutes", "prepTime", "prepTimeSource");
      const cookTime = resolveTime("cookTimeMinutes", "cookTime", "cookTimeSource");
      const totalTime = resolveTime("totalTimeMinutes", "totalTime", "totalTimeSource");

      const pages = await draftsRepository.getPages(draftId);

      const recipe = await recipesRepository.save({
        userId: request.userId,
        title: edited.title,
        description: edited.description,
        descriptionSummary: null, // Feature 5 wiring deferred
        sourceType: draft.sourceType as "image" | "url",
        originalUrl: draft.originalUrl,
        imageUrl: null,
        baselineServings,
        prepTimeMinutes: prepTime.minutes,
        prepTimeSource: prepTime.source,
        cookTimeMinutes: cookTime.minutes,
        cookTimeSource: cookTime.source,
        totalTimeMinutes: totalTime.minutes,
        totalTimeSource: totalTime.source,
        saveDecision,
        ingredients: edited.ingredients.map((ing) => ({
          text: ing.text,
          orderIndex: ing.orderIndex,
          isHeader: ing.isHeader,
          amount: ing.amount ?? null,
          amountMax: ing.amountMax ?? null,
          unit: ing.unit ?? null,
          name: ing.name ?? null,
          rawText: ing.raw ?? ing.text,
          isScalable: ing.isScalable ?? false,
        })),
        steps: edited.steps.map((step) => ({
          text: step.text,
          summaryText: null, // Feature 5 wiring deferred
          orderIndex: step.orderIndex,
          isHeader: step.isHeader,
        })),
        sourcePages: pages.map((p) => ({
          orderIndex: p.orderIndex,
          imageUri: p.imageUri,
          extractedText: p.ocrText,
        })),
      });
      let resolvedRecipe = {
        ...recipe,
        ...(await resolveImageUrls(recipe.imageUrl ?? null)),
      };

      let heroImageAttached = false;
      let heroFailureReason: "no_metadata_url" | "download_failed" | null = null;
      let metadataImageUrl: string | null = null;
      let heroErrorMessage: string | null = null;

      try {
        let imagePath: string | null = null;
        if (draft.sourceType === "url") {
          metadataImageUrl = parsedCandidate?.metadata?.imageUrl ?? null;
          if (metadataImageUrl) {
            try {
              imagePath = await downloadAndStoreFromUrl(
                request.userId,
                recipe.id,
                metadataImageUrl,
              );
              if (!imagePath) {
                heroFailureReason = "download_failed";
              }
            } catch (err) {
              heroFailureReason = "download_failed";
              heroErrorMessage = err instanceof Error ? err.message : String(err);
            }
          } else {
            heroFailureReason = "no_metadata_url";
          }
        } else {
          const firstPage = pages.find((p) => p.orderIndex === 0);
          if (firstPage?.imageUri) {
            imagePath = await copyFromDraftPage(request.userId, recipe.id, firstPage.imageUri);
          }
        }

        if (imagePath) {
          await recipesRepository.setImage(recipe.id, imagePath);
          resolvedRecipe = {
            ...resolvedRecipe,
            ...(await resolveImageUrls(imagePath)),
          };
          heroImageAttached = true;
          heroFailureReason = null;
        }
      } catch (err) {
        request.log.warn({ err, draftId }, "Failed to attach recipe hero image during save");
        if (!heroFailureReason) {
          heroFailureReason = "download_failed";
        }
        if (!heroErrorMessage) {
          heroErrorMessage = err instanceof Error ? err.message : String(err);
        }
      }

      if (draft.sourceType === "url" && !heroImageAttached) {
        trackAnalytics(
          "server_hero_image_missing",
          {
            draft_id: draftId,
            recipe_id: recipe.id,
            url: draft.originalUrl ?? null,
            domain: extractDomain(draft.originalUrl),
            extraction_method: parsedCandidate?.extractionMethod ?? "unknown",
            reason: heroFailureReason ?? "download_failed",
            metadata_image_url: metadataImageUrl,
            error_message: heroErrorMessage,
          },
          { userId: request.userId },
        );
      }

      await draftsRepository.markSaved(draftId);

      logEvent("recipe_saved", {
        draftId,
        recipeId: recipe.id,
        sourceType: draft.sourceType,
        saveState: saveDecision.saveState,
        warningsDismissed: dismissedIssueIds.length > 0,
      });

      const hadUserEdits =
        edited.title !== (parsedCandidate?.title ?? null) ||
        edited.ingredients.length !== (parsedCandidate?.ingredients.length ?? 0) ||
        edited.steps.length !== (parsedCandidate?.steps.length ?? 0);

      trackAnalytics(
        "server_recipe_saved",
        {
          draft_id: draftId,
          recipe_id: recipe.id,
          source_type: draft.sourceType,
          url: draft.originalUrl ?? null,
          domain: extractDomain(draft.originalUrl),
          extraction_method:
            draft.sourceType === "image"
              ? "vision"
              : (parsedCandidate?.extractionMethod ?? "unknown"),
          save_state: saveDecision.saveState,
          had_user_edits: hadUserEdits,
          dismissed_issue_count: dismissedIssueIds.length,
          ingredient_count: edited.ingredients.length,
          step_count: edited.steps.length,
          had_servings: baselineServings != null,
          had_prep_time: prepTime.minutes != null,
          had_cook_time: cookTime.minutes != null,
          had_total_time: totalTime.minutes != null,
          hero_image_attached: heroImageAttached,
          hero_image_failure_reason: heroFailureReason,
          had_metadata_image_url:
            draft.sourceType === "url" ? metadataImageUrl != null : null,
        },
        { userId: request.userId },
      );

      return reply.status(201).send({ recipe: resolvedRecipe, saveDecision });
    },
  );
}
