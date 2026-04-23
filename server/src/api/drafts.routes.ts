import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";
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
  TimeSource,
} from "@orzo/shared";
import { URL_IMPORT_HTML_MAX_BYTES } from "@orzo/shared";
import { parseImages } from "../parsing/image/image-parse.adapter.js";
import {
  parseUrl,
  parseUrlFromHtml,
  parseUrlStructuredOnly,
  type UrlAcquisitionMethod,
} from "../parsing/url/url-parse.adapter.js";
import { fetchUrl } from "../parsing/url/url-fetch.service.js";
import { logEvent } from "../observability/event-logger.js";
import { trackAnalytics, extractDomain } from "../observability/analytics.js";
import { optimizeForUpload } from "../parsing/image/image-optimizer.js";
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
import { withTimeout } from "../lib/timeout.js";
import { parseIngredientLine } from "../parsing/ingredient-parser.js";

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

  const prepTimeSource = candidate.metadata?.prepTimeSource ?? null;
  const cookTimeSource = candidate.metadata?.cookTimeSource ?? null;
  const totalTimeSource = candidate.metadata?.totalTimeSource ?? null;
  const hadPrepTime = Boolean(candidate.metadata?.prepTime);
  const hadCookTime = Boolean(candidate.metadata?.cookTime);
  const hadTotalTime = Boolean(candidate.metadata?.totalTime);
  const presentTimeCount =
    Number(hadPrepTime) + Number(hadCookTime) + Number(hadTotalTime);
  const timeCompleteness =
    presentTimeCount === 3 ? "all" : presentTimeCount === 0 ? "none" : "partial";
  const hasInferredTime =
    prepTimeSource === "inferred" ||
    cookTimeSource === "inferred" ||
    totalTimeSource === "inferred";
  const hasExplicitTime =
    prepTimeSource === "explicit" ||
    cookTimeSource === "explicit" ||
    totalTimeSource === "explicit";

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
    had_prep_time: hadPrepTime,
    had_cook_time: hadCookTime,
    had_total_time: hadTotalTime,
    prep_time_source: prepTimeSource,
    cook_time_source: cookTimeSource,
    total_time_source: totalTimeSource,
    time_completeness: timeCompleteness,
    has_inferred_time: hasInferredTime,
    has_explicit_time: hasExplicitTime,
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

/**
 * Shared post-parse logic: validate → persist → emit analytics. Called by
 * both the synchronous fast path and the background path so analytics
 * emission, DB writes, and warning-state upserts stay identical across
 * paths. Expects the caller to have already set the draft status to
 * "PARSING" (both the sync and background paths do this). Returns null
 * if the setParsedCandidate status guard rejected (draft was cancelled
 * in flight).
 */
async function finalizeParseResult(params: {
  draftId: string;
  draft: DraftRow;
  candidate: ParsedRecipeCandidate;
  pageCount: number;
  startTime: number;
  resolvedAcquisition: UrlAcquisitionMethod | null;
}): Promise<{
  candidate: ParsedRecipeCandidate;
  validationResult: ValidationResult;
  nextStatus: DraftStatus;
} | null> {
  const { draftId, draft, candidate, pageCount, startTime, resolvedAcquisition } =
    params;

  const validationResult = validateRecipe(candidate);
  const nextStatus: DraftStatus = validationResult.requiresRetake
    ? "NEEDS_RETAKE"
    : "PARSED";

  const updated = await draftsRepository.setParsedCandidate(
    draftId,
    candidate,
    validationResult,
    nextStatus,
    "PARSING",
  );

  if (!updated) {
    console.warn(
      `[parse] Draft ${draftId} was cancelled during parse, skipping result write`,
    );
    return null;
  }

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

  const elapsed_ms = Date.now() - startTime;
  logEvent("parse_completed", {
    draftId,
    sourceType: draft.sourceType,
    pageCount,
    elapsed_ms,
  });
  logEvent("validation_completed", {
    draftId,
    issueCountBlock: validationResult.issues.filter((i) => i.severity === "BLOCK")
      .length,
    issueCountFlag: validationResult.issues.filter((i) => i.severity === "FLAG")
      .length,
    issueCountRetake: validationResult.issues.filter((i) => i.severity === "RETAKE")
      .length,
  });

  const analyticsProps = deriveParseEventProps(
    draft,
    candidate,
    validationResult,
    pageCount,
    elapsed_ms,
    resolvedAcquisition,
  );
  trackAnalytics("server_parse_completed", analyticsProps, {
    userId: draft.userId,
  });
  trackAnalytics("server_parse_validated", analyticsProps, {
    userId: draft.userId,
  });

  return { candidate, validationResult, nextStatus };
}

function resolveUrlAcquisition(
  suppliedHtml: string,
  preFetchedHtml: string | null,
  parseBody: { acquisitionMethod?: UrlAcquisitionMethod },
): UrlAcquisitionMethod {
  if (suppliedHtml) return "webview-html";
  if (preFetchedHtml) {
    return parseBody.acquisitionMethod === "server-fetch-fallback"
      ? "server-fetch-fallback"
      : "server-fetch";
  }
  return parseBody.acquisitionMethod === "server-fetch-fallback"
    ? "server-fetch-fallback"
    : "server-fetch";
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
  preFetchedHtml: string | null = null,
) {
  try {
    await acquireParseLock();

    // runParseInBackground runs AFTER the POST /drafts/:id/parse response
    // returned 202, so the HTTP request's trace has already finished. If we
    // just call startSpan here, children inherit the finished parent's
    // sampled=false decision and nothing lands. startNewTrace detaches us
    // from that dead parent and makes a fresh root trace so the sampling
    // decision is made against tracesSampleRate from scratch.
    await Sentry.startNewTrace(() =>
      Sentry.startSpan(
        {
          name: "parse.background",
          op: "parse",
          attributes: {
            "parse.draft_id": draftId,
            "parse.source_type": draft.sourceType,
          },
        },
        async () => {
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
            // Webview capture occasionally returns a skeletal DOM that's
            // missing the recipe body — observed on chefmichaelsmith.com
            // where the in-app WebKit capture had title/nav/footer but no
            // recipe content, while a fresh server fetch gets the full
            // page. Retry via server fetch when the webview path errors.
            if (candidate.extractionMethod === "error") {
              logEvent("webview_html_retry_via_server_fetch", {
                draftId,
                url: draft.originalUrl,
                suppliedBytes: Buffer.byteLength(suppliedHtml, "utf8"),
              });
              try {
                const retry = await parseUrl(
                  draft.originalUrl,
                  sourcePages,
                  "server-fetch-fallback",
                );
                if (retry.extractionMethod !== "error") {
                  candidate = retry;
                }
              } catch {
                // Keep the original error candidate if the fallback throws.
              }
            }
          } else if (preFetchedHtml) {
            // Sync fast-path already fetched the HTML but structured data
            // didn't pass the quality gate — reuse the HTML instead of paying
            // the network cost a second time.
            const acquisitionMethod: UrlAcquisitionMethod =
              parseBody.acquisitionMethod === "server-fetch-fallback"
                ? "server-fetch-fallback"
                : "server-fetch";
            candidate = await parseUrlFromHtml(
              draft.originalUrl,
              preFetchedHtml,
              sourcePages,
              acquisitionMethod,
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
          // Download each page's already-optimized buffer from Supabase and
          // base64-encode it for OpenAI vision input. We intentionally DO
          // NOT run `optimizeForOcr` here — the buffer we uploaded via
          // `optimizeForUpload` (3072px @ 85% JPEG) is already the right
          // shape for the LLM. The old double-encode was ~300-500ms of
          // pure waste per page. If quality ever suffers at q85, raise
          // `optimizeForUpload` to q90 instead of re-encoding on read.
          const downloadTimeoutMs = getSupabaseDownloadTimeoutMs();
          const imageDataUrls = await Promise.all(
            pages.map((page, index) =>
              Sentry.startSpan(
                {
                  name: "supabase.download",
                  op: "http.client",
                  attributes: {
                    "page.index": index,
                    "page.id": page.id,
                    "timeout_ms": downloadTimeoutMs,
                  },
                },
                async () => {
                  let downloadResult;
                  try {
                    downloadResult = await withTimeout(
                      getSupabase().storage
                        .from(RECIPE_PAGES_BUCKET)
                        .download(page.imageUri),
                      downloadTimeoutMs,
                      "supabase download",
                    );
                  } catch (err) {
                    // Distinguish our timeout from Supabase's own errors so
                    // the Sentry trace can be filtered cleanly. A spike in
                    // timed_out=true means Supabase Storage is degrading.
                    if (
                      err instanceof Error &&
                      err.message.includes("supabase download timeout")
                    ) {
                      Sentry.getActiveSpan()?.setAttribute("timed_out", true);
                    }
                    throw err;
                  }
                  const { data, error } = downloadResult;
                  if (error || !data)
                    throw new Error(error?.message ?? "Download returned no data");
                  const rawBuffer = Buffer.from(await data.arrayBuffer());
                  const b64 = rawBuffer.toString("base64");
                  return `data:image/jpeg;base64,${b64}`;
                },
              ),
            ),
          );
          // parseImages internally fans out into two parallel OpenAI calls
          // (see image-parse.adapter.ts). Sentry's async-context tracking
          // auto-instruments each OpenAI request as its own span via the
          // @sentry/instrumentation-openai integration, so we don't need
          // to manually wrap the two calls here — the adapter span tree
          // is: parse.image-adapter → (openai A || openai B).
          candidate = await Sentry.startSpan(
            {
              name: "parse.image-adapter",
              op: "parse.images",
              attributes: {
                "ai.page_count": pages.length,
                "ai.model.ingredients": "gpt-5.4",
                "ai.model.steps": "gpt-4o",
              },
            },
            () => parseImages(imageDataUrls, sourcePages),
          );
        }

        const resolvedAcquisition: UrlAcquisitionMethod | null =
          draft.sourceType === "url"
            ? resolveUrlAcquisition(suppliedHtml, preFetchedHtml, parseBody)
            : null;

        if (draft.sourceType === "url" && draft.originalUrl) {
          logEvent("url_parse_source_selected", {
            draftId,
            acquisitionMethod: resolvedAcquisition,
          });
        }

        await Sentry.startSpan(
          {
            name: "parse.finalize",
            op: "function",
            attributes: {
              "parse.draft_id": draftId,
              "parse.page_count": pages.length,
            },
          },
          () =>
            finalizeParseResult({
              draftId,
              draft,
              candidate,
              pageCount: pages.length,
              startTime,
              resolvedAcquisition,
            }),
        );
      },
    ),
    );
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
            ? resolveUrlAcquisition(suppliedHtml, preFetchedHtml, parseBody)
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

/**
 * Hard cap on the sync fast path's network fetch. Shorter than `fetchUrl`'s
 * own 15s cap — we don't want to block the HTTP response when the source
 * site is slow. On timeout we fall through to the background path which
 * still has the full 60s parse budget.
 */
const SYNC_FETCH_TIMEOUT_MS = 4000;

async function fetchWithTimeout(url: string, ms: number): Promise<string> {
  return withTimeout(fetchUrl(url), ms, "sync fetch");
}

/**
 * Hard cap on a single Supabase Storage `.download()` call. Prod observed a
 * 60s hang on 2026-04-19 (Sentry trace 064c8b45504449af9d0d325efd0b8f7d).
 * Mobile's XState `parsing` budget is 60s end-to-end; we need to fail well
 * inside that so the user sees a real parse_failed error and can retake,
 * instead of staring at the parsing splash for a full minute.
 *
 * Read on every call (not cached at module load) so integration tests can
 * drive a short timeout via process.env without a re-import dance, and so
 * ops can tune per-environment without redeploy.
 */
function getSupabaseDownloadTimeoutMs(): number {
  const raw = process.env.SUPABASE_DOWNLOAD_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 18_000;
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

      // --- Synchronous fast path (URL imports only) ---
      //
      // When structured data (JSON-LD or Microdata) is published by the
      // source and passes our quality gate, we can parse, validate, and
      // return the candidate inline — no background job, no polling.
      // Mobile's xstate actor already skips its poll loop when the POST
      // response has `status !== "PARSING"`, so this drops perceived
      // latency by ~3s (the client-side `POLL_INTERVAL`) on the common
      // happy path. Falls through to the background path when:
      //   - source is an image (vision is always slow)
      //   - HTML fetch times out (4s cap)
      //   - neither JSON-LD nor Microdata passes the quality gate
      //   - any unexpected error in the sync path
      if (draft.sourceType === "url" && draft.originalUrl) {
        let html: string | null = suppliedHtml || null;
        if (!html) {
          try {
            html = await fetchWithTimeout(
              draft.originalUrl,
              SYNC_FETCH_TIMEOUT_MS,
            );
          } catch (err) {
            console.log(
              JSON.stringify({
                timestamp: new Date().toISOString(),
                event: "sync_parse_fetch_failed",
                draftId,
                reason: err instanceof Error ? err.message : "unknown",
              }),
            );
            html = null;
          }
        }

        if (html) {
          try {
            const pages = await draftsRepository.getPages(draftId);
            const sourcePages: SourcePage[] = pages.map((p) => ({
              id: p.id,
              orderIndex: p.orderIndex,
              sourceType: "url",
              retakeCount: p.retakeCount,
              imageUri: p.imageUri,
              extractedText: p.ocrText,
            }));
            const resolvedAcquisition = resolveUrlAcquisition(
              suppliedHtml,
              suppliedHtml ? null : html,
              parseBody,
            );
            const candidate = await parseUrlStructuredOnly(
              draft.originalUrl,
              html,
              sourcePages,
              resolvedAcquisition,
            );
            if (candidate) {
              logEvent("url_parse_source_selected", {
                draftId,
                acquisitionMethod: resolvedAcquisition,
                fastPath: true,
              });
              const result = await finalizeParseResult({
                draftId,
                draft,
                candidate,
                pageCount: pages.length,
                startTime,
                resolvedAcquisition,
              });
              if (result) {
                return reply.status(200).send({
                  status: result.nextStatus,
                  candidate: result.candidate,
                  validationResult: result.validationResult,
                });
              }
              // result === null means the draft was cancelled in flight;
              // fall through to background so the existing cancellation
              // handling runs.
            }
          } catch (err) {
            // Any unexpected error in the sync path — log and fall
            // through. Do NOT surface to the client; background path
            // will retry and own the final error reporting.
            console.warn(
              `[parse] sync fast path threw for draft ${draftId}, falling back to background:`,
              err,
            );
          }
        }

        // Sync path didn't produce a candidate. Hand off to the
        // background job with the HTML we've already fetched (if any) so
        // we don't pay the network cost twice.
        const preFetchedHtml = !suppliedHtml && html ? html : null;
        runParseInBackground(
          draftId,
          draft,
          suppliedHtml,
          parseBody,
          startTime,
          preFetchedHtml,
        );
        return reply.status(202).send({ status: "PARSING" });
      }

      // Image imports always go async — vision parses are measured in
      // seconds and don't belong on the HTTP response path.
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
        source: TimeSource | null;
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
      let totalTime = resolveTime("totalTimeMinutes", "totalTime", "totalTimeSource");

      // Gap-fill: when the parse supplied prep + cook but no total (common
      // on JSON-LD partials like savoryonline), derive total = prep + cook
      // and persist it as "derived" — a distinct source from "inferred"
      // (AI guess) so the client can render it clean instead of with the
      // "~" uncertainty prefix. The components ARE explicit; the sum is
      // arithmetic, not a guess. Skipped when the user explicitly set
      // totalTimeMinutes via the TimesReviewBanner (including clearing to
      // null) — user intent wins over derivation.
      const totalExplicitlyOverridden = "totalTimeMinutes" in edited;
      if (
        !totalExplicitlyOverridden &&
        totalTime.minutes == null &&
        prepTime.minutes != null &&
        cookTime.minutes != null
      ) {
        totalTime = {
          minutes: prepTime.minutes + cookTime.minutes,
          source: "derived",
        };
      }

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
        // Re-parse each ingredient's text via parseIngredientLine here,
        // NOT just trust the structured fields that came in on the
        // editedCandidate payload. Background: the preview editor
        // (mobile/src/features/import/PreviewEditView.tsx) only edits
        // ing.text when the user edits an ingredient line — the
        // structured amount/unit/name/amountMax fields stay at their
        // original parse-time values. Trusting them here meant a user
        // who edited "3 cups water" to "2/3 cups water" in preview got
        // a saved recipe with text="2/3 cups water" BUT amount=3,
        // unit="cup", name="water" — and the detail screen's
        // scaleIngredient render composes from the structured fields,
        // not text. So the detail showed "3 cup water" until the user
        // opened the edit screen (which DID re-parse via the same
        // parseIngredientLine call on PUT /recipes/:id) and saved
        // again. Re-parsing here closes that gap so preview-save and
        // post-save-edit produce identical stored fields.
        ingredients: edited.ingredients.map((ing) => {
          if (ing.isHeader) {
            return {
              text: ing.text,
              orderIndex: ing.orderIndex,
              isHeader: true,
              amount: null,
              amountMax: null,
              unit: null,
              name: null,
              rawText: ing.text,
              isScalable: false,
            };
          }
          const parsed = parseIngredientLine(ing.text);
          return {
            text: ing.text,
            orderIndex: ing.orderIndex,
            isHeader: false,
            amount: parsed.amount,
            amountMax: parsed.amountMax,
            unit: parsed.unit,
            name: parsed.name,
            rawText: ing.text,
            isScalable: parsed.isScalable,
          };
        }),
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

      if (draft.sourceType === "url") {
        logEvent("hero_image_attach", {
          draftId,
          recipeId: recipe.id,
          url: draft.originalUrl ?? null,
          attached: heroImageAttached,
          metadataImageUrl,
          reason: heroFailureReason,
          errorMessage: heroErrorMessage,
        });
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
          prep_time_source_final: prepTime.source,
          cook_time_source_final: cookTime.source,
          total_time_source_final: totalTime.source,
          any_inferred_time_final:
            prepTime.source === "inferred" ||
            cookTime.source === "inferred" ||
            totalTime.source === "inferred",
          any_derived_time_final:
            prepTime.source === "derived" ||
            cookTime.source === "derived" ||
            totalTime.source === "derived",
          any_user_confirmed_time:
            prepTime.source === "user_confirmed" ||
            cookTime.source === "user_confirmed" ||
            totalTime.source === "user_confirmed",
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
