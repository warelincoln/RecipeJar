import { setup, assign, fromPromise } from "xstate";
import { api, type UrlParseRequest } from "../../services/api";
import { analytics } from "../../services/analytics";
import { extractDomain } from "../../utils/url";
import type {
  ParsedRecipeCandidate,
  EditedRecipeCandidate,
  ValidationResult,
  DraftStatus,
} from "@orzo/shared";

type ImportEventValue = string | number | boolean | null | string[];
type ImportEventProps = Record<string, ImportEventValue>;

/**
 * Shared properties for every `import_*` PostHog event fired from the state
 * machine. Keeps URL, domain, extraction method, and issue codes on a single
 * distinct_id so the dashboard's breakdowns stay consistent between
 * client-side and server-side events.
 */
export function buildImportEventProps(
  context: ImportContext,
  extras?: ImportEventProps,
): ImportEventProps {
  const candidate = context.parsedCandidate;
  const validation = context.validationResult;
  const blockCodes =
    validation?.issues.filter((i) => i.severity === "BLOCK").map((i) => i.code) ??
    [];
  const retakeCodes =
    validation?.issues.filter((i) => i.severity === "RETAKE").map((i) => i.code) ??
    [];
  const flagCodes =
    validation?.issues.filter((i) => i.severity === "FLAG").map((i) => i.code) ??
    [];

  const prepTimeSource = candidate?.metadata?.prepTimeSource ?? null;
  const cookTimeSource = candidate?.metadata?.cookTimeSource ?? null;
  const totalTimeSource = candidate?.metadata?.totalTimeSource ?? null;
  const hadPrepTime = Boolean(candidate?.metadata?.prepTime);
  const hadCookTime = Boolean(candidate?.metadata?.cookTime);
  const hadTotalTime = Boolean(candidate?.metadata?.totalTime);
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

  const base: ImportEventProps = {
    source_type: context.sourceType,
    draft_id: context.draftId,
    url: context.url,
    domain: extractDomain(context.url),
    acquisition_method: context.urlAcquisitionMethod ?? null,
    extraction_method:
      context.sourceType === "image"
        ? "vision"
        : (candidate?.extractionMethod ?? null),
    page_count: context.capturedPages.length,
    ingredient_count: candidate?.ingredients?.length ?? 0,
    step_count: candidate?.steps?.length ?? 0,
    save_state: validation?.saveState ?? null,
    has_blocking_issues: validation?.hasBlockingIssues ?? false,
    requires_retake: validation?.requiresRetake ?? false,
    block_codes: blockCodes,
    first_block_code: blockCodes[0] ?? null,
    retake_codes: retakeCodes,
    flag_codes: flagCodes,
    first_flag_code: flagCodes[0] ?? null,
    has_flags: flagCodes.length > 0,
    had_prep_time: hadPrepTime,
    had_cook_time: hadCookTime,
    had_total_time: hadTotalTime,
    prep_time_source: prepTimeSource,
    cook_time_source: cookTimeSource,
    total_time_source: totalTimeSource,
    time_completeness: timeCompleteness,
    has_inferred_time: hasInferredTime,
    has_explicit_time: hasExplicitTime,
  };
  return { ...base, ...(extras ?? {}) };
}

export interface CapturedPage {
  pageId: string;
  imageUri: string;
  orderIndex: number;
  mimeType?: string;
  fileName?: string;
  retakeCount?: number;
}

export interface ImportContext {
  draftId: string | null;
  sourceType: "image" | "url";
  imageEntry: "camera" | "photos";
  url: string | null;
  urlHtml: string | null;
  urlAcquisitionMethod: UrlParseRequest["acquisitionMethod"] | null;
  urlCaptureFailureReason: UrlParseRequest["captureFailureReason"] | null;
  capturedPages: CapturedPage[];
  parsedCandidate: ParsedRecipeCandidate | null;
  editedCandidate: EditedRecipeCandidate | null;
  validationResult: ValidationResult | null;
  retakePageId: string | null;
  savedRecipeId: string | null;
  error: string | null;
  parseStartedAt: number | null;
}

type ImportEvent =
  | { type: "NEW_IMAGE_IMPORT" }
  | {
      type: "NEW_URL_IMPORT";
      url: string;
      urlHtml?: string;
      urlAcquisitionMethod?: UrlParseRequest["acquisitionMethod"];
      urlCaptureFailureReason?: UrlParseRequest["captureFailureReason"];
    }
  | { type: "PHOTOS_SELECTED"; imageUris: { uri: string; type?: string; fileName?: string }[] }
  | { type: "RESUME_DRAFT"; draftId: string }
  | { type: "PAGE_CAPTURED"; imageUri: string }
  | { type: "DONE_CAPTURING" }
  | { type: "CONFIRM_ORDER" }
  | {
      type: "EDIT_CANDIDATE";
      candidate: EditedRecipeCandidate;
      validationResult: ValidationResult;
    }
  | { type: "ATTEMPT_SAVE" }
  | { type: "RETAKE_SUBMITTED"; imageUri: string }
  | { type: "RETAKE_PAGE"; pageId: string }
  | { type: "RETAKE_GO_HOME" }
  | { type: "REORDER"; pageOrder: { pageId: string; orderIndex: number }[] };

const STATUS_TO_STATE: Record<DraftStatus, string> = {
  CAPTURE_IN_PROGRESS: "capture",
  READY_FOR_PARSE: "reorder",
  PARSING: "parsing",
  PARSED: "previewEdit",
  NEEDS_RETAKE: "retakeRequired",
  IN_GUIDED_CORRECTION: "previewEdit",
  READY_TO_SAVE: "previewEdit",
  SAVED: "saved",
  PARSE_FAILED: "idle",
  CANCELLED: "idle",
};

const PARSE_TERMINAL_STATUSES = new Set([
  "PARSED",
  "NEEDS_RETAKE",
  "PARSE_FAILED",
  "CANCELLED",
  "SAVED",
]);

const POLL_INTERVAL = 3000;

type ServerDraftPageRow = {
  id: string;
  imageUri: string;
  orderIndex: number;
  retakeCount?: number;
  resolvedImageUrl?: string;
};

function serverPagesToCaptured(
  pages: ServerDraftPageRow[] | undefined,
): CapturedPage[] {
  if (!pages?.length) return [];
  return pages
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((p) => ({
      pageId: p.id,
      imageUri: p.resolvedImageUrl ?? p.imageUri,
      orderIndex: p.orderIndex,
      retakeCount: p.retakeCount ?? 0,
    }));
}

export const importMachine = setup({
  types: {
    context: {} as ImportContext,
    events: {} as ImportEvent,
  },
  actors: {
    createDraft: fromPromise(async () => {
      const draft = await api.drafts.create();
      return draft;
    }),
    createUrlDraft: fromPromise(async ({ input }: { input: { url: string } }) => {
      const draft = await api.drafts.createFromUrl(input.url);
      return draft;
    }),
    addPage: fromPromise(
      async ({ input }: { input: { draftId: string; imageUri: string } }) => {
        return api.drafts.addPage(input.draftId, input.imageUri);
      },
    ),
    uploadDraft: fromPromise(
      async ({
        input,
      }: {
        input: { pages: { imageUri: string; orderIndex: number; mimeType?: string; fileName?: string }[] };
      }) => {
        const draft = await api.drafts.create();
        const uploadedPages = [];
        for (const page of input.pages) {
          const uploaded = await api.drafts.addPage(draft.id, page.imageUri, page.mimeType, page.fileName);
          uploadedPages.push(uploaded);
        }
        return { draftId: draft.id, pages: uploadedPages };
      },
    ),
    parseDraft: fromPromise(
      async ({
        input,
      }: {
        input: {
          draftId: string;
          urlHtml?: string | null;
          acquisitionMethod?: UrlParseRequest["acquisitionMethod"] | null;
          captureFailureReason?: UrlParseRequest["captureFailureReason"] | null;
        };
      }) => {
        const parsePayload: UrlParseRequest | undefined =
          input.urlHtml || input.acquisitionMethod === "server-fetch-fallback"
            ? {
                ...(input.urlHtml ? { html: input.urlHtml } : {}),
                ...(input.acquisitionMethod
                  ? { acquisitionMethod: input.acquisitionMethod }
                  : {}),
                ...(input.captureFailureReason
                  ? { captureFailureReason: input.captureFailureReason }
                  : {}),
              }
            : undefined;

        const response = await api.drafts.parse(input.draftId, parsePayload);

        if (response.status === "PARSING") {
          while (true) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL));
            const draft = await api.drafts.get(input.draftId);
            if (PARSE_TERMINAL_STATUSES.has(draft.status)) {
              if (draft.status === "PARSE_FAILED" || draft.status === "CANCELLED") {
                throw new Error(
                  (draft as unknown as { parseErrorMessage?: string }).parseErrorMessage ??
                    "Parse failed",
                );
              }
              return {
                status: draft.status,
                candidate: draft.parsedCandidate as ParsedRecipeCandidate,
                validationResult: draft.validationResult as ValidationResult,
              };
            }
          }
        }

        return response as {
          status: string;
          candidate: ParsedRecipeCandidate;
          validationResult: ValidationResult;
        };
      },
    ),
    saveDraft: fromPromise(
      async ({ input }: { input: { draftId: string } }) => {
        return api.drafts.save(input.draftId);
      },
    ),
    resumeDraft: fromPromise(
      async ({ input }: { input: { draftId: string } }) => {
        return api.drafts.get(input.draftId);
      },
    ),
    updateCandidate: fromPromise(
      async ({
        input,
      }: {
        input: { draftId: string; candidate: EditedRecipeCandidate };
      }) => {
        return api.drafts.updateCandidate(input.draftId, input.candidate);
      },
    ),
  },
}).createMachine({
  id: "importFlow",
  initial: "idle",
  context: {
    draftId: null,
    sourceType: "image",
    imageEntry: "camera",
    url: null,
    urlHtml: null,
    urlAcquisitionMethod: null,
    urlCaptureFailureReason: null,
    capturedPages: [],
    parsedCandidate: null,
    editedCandidate: null,
    validationResult: null,
    retakePageId: null,
    savedRecipeId: null,
    error: null,
    parseStartedAt: null,
  },
  states: {
    idle: {
      on: {
        NEW_IMAGE_IMPORT: { target: "capture" },
        NEW_URL_IMPORT: {
          target: "creatingUrlDraft",
          actions: [
            assign({
              sourceType: () => "url" as const,
              url: ({ event }) => event.url,
              urlHtml: ({ event }) => event.urlHtml ?? null,
              urlAcquisitionMethod: ({ event }) =>
                event.urlAcquisitionMethod ?? (event.urlHtml ? "webview-html" : "server-fetch"),
              urlCaptureFailureReason: ({ event }) =>
                event.urlCaptureFailureReason ?? null,
            }),
            ({ event }) => {
              analytics.track("import_url_entered", {
                source_type: "url",
                url: event.url,
                domain: extractDomain(event.url),
                acquisition_method: event.urlAcquisitionMethod ?? (event.urlHtml ? "webview-html" : "server-fetch"),
              });
            },
          ],
        },
        PHOTOS_SELECTED: {
          target: "uploading",
          actions: assign({
            imageEntry: () => "photos" as const,
            capturedPages: ({ event }) =>
              event.imageUris.map((img, i) => ({
                pageId: "",
                imageUri: img.uri,
                orderIndex: i,
                mimeType: img.type,
                fileName: img.fileName,
              })),
          }),
        },
        RESUME_DRAFT: {
          target: "resuming",
          actions: assign({ draftId: ({ event }) => event.draftId }),
        },
      },
    },

    resuming: {
      invoke: {
        src: "resumeDraft",
        input: ({ context }) => ({ draftId: context.draftId! }),
        onDone: [
          {
            guard: ({ event }) =>
              STATUS_TO_STATE[event.output.status as DraftStatus] === "capture",
            target: "capture",
            actions: assign({
              parsedCandidate: ({ event }) => event.output.parsedCandidate,
              validationResult: ({ event }) => event.output.validationResult,
              capturedPages: ({ event }) =>
                serverPagesToCaptured(
                  event.output.pages as ServerDraftPageRow[] | undefined,
                ),
            }),
          },
          {
            guard: ({ event }) =>
              STATUS_TO_STATE[event.output.status as DraftStatus] === "previewEdit",
            target: "previewEdit",
            actions: assign({
              parsedCandidate: ({ event }) => event.output.parsedCandidate,
              editedCandidate: ({ event }) => event.output.editedCandidate,
              validationResult: ({ event }) => event.output.validationResult,
              capturedPages: ({ event }) =>
                serverPagesToCaptured(
                  event.output.pages as ServerDraftPageRow[] | undefined,
                ),
            }),
          },
          {
            guard: ({ event }) =>
              STATUS_TO_STATE[event.output.status as DraftStatus] ===
              "retakeRequired",
            target: "retakeRequired",
            actions: assign({
              parsedCandidate: ({ event }) => event.output.parsedCandidate,
              validationResult: ({ event }) => event.output.validationResult,
              capturedPages: ({ event }) =>
                serverPagesToCaptured(
                  event.output.pages as ServerDraftPageRow[] | undefined,
                ),
            }),
          },
          { target: "capture" },
        ],
        onError: {
          target: "idle",
          actions: assign({ error: () => "Failed to resume draft" }),
        },
      },
    },

    capture: {
      on: {
        PAGE_CAPTURED: {
          actions: assign({
            capturedPages: ({ context, event }) => [
              ...context.capturedPages,
              {
                pageId: "",
                imageUri: event.imageUri,
                orderIndex: context.capturedPages.length,
              },
            ],
          }),
        },
        DONE_CAPTURING: { target: "reorder" },
      },
    },

    reorder: {
      on: {
        REORDER: {
          actions: assign({
            capturedPages: ({ context, event }) =>
              event.pageOrder.map((po) => {
                const existing = context.capturedPages.find(
                  (p) => p.pageId === po.pageId,
                );
                return existing
                  ? { ...existing, orderIndex: po.orderIndex }
                  : { pageId: po.pageId, imageUri: "", orderIndex: po.orderIndex };
              }),
          }),
        },
        CONFIRM_ORDER: { target: "uploading" },
      },
    },

    creatingUrlDraft: {
      invoke: {
        src: "createUrlDraft",
        input: ({ context }) => ({ url: context.url! }),
        onDone: {
          target: "parsing",
          actions: assign({
            draftId: ({ event }) => event.output.id,
          }),
        },
        onError: {
          target: "idle",
          actions: assign({ error: () => "Failed to create draft from URL." }),
        },
      },
    },

    uploading: {
      invoke: {
        src: "uploadDraft",
        input: ({ context }) => ({
          pages: context.capturedPages.map((p) => ({
            imageUri: p.imageUri,
            orderIndex: p.orderIndex,
            mimeType: p.mimeType,
            fileName: p.fileName,
          })),
        }),
        onDone: {
          target: "parsing",
          actions: assign({
            draftId: ({ event }) => event.output.draftId,
          }),
        },
        onError: {
          target: "idle",
          actions: assign({ error: () => "Failed to upload pages. Please try again." }),
        },
      },
    },

    parsing: {
      entry: assign({ parseStartedAt: () => Date.now() }),
      after: {
        60000: {
          target: "timedOut",
          actions: [
            assign({
              error: () => "This is taking longer than expected. Please try again.",
            }),
            ({ context }) => {
              const durationMs =
                context.parseStartedAt != null
                  ? Date.now() - context.parseStartedAt
                  : null;
              analytics.track(
                "import_timed_out",
                buildImportEventProps(context, { parse_duration_ms: durationMs }),
              );
            },
          ],
        },
      },
      invoke: {
        src: "parseDraft",
        input: ({ context }) => ({
          draftId: context.draftId!,
          urlHtml: context.urlHtml,
          acquisitionMethod: context.urlAcquisitionMethod,
          captureFailureReason: context.urlCaptureFailureReason,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.status === "NEEDS_RETAKE",
            target: "retakeRequired",
            actions: [
              assign({
                parsedCandidate: ({ event }) => event.output.candidate,
                validationResult: ({ event }) => event.output.validationResult,
              }),
              ({ context, event }) => {
                const durationMs =
                  context.parseStartedAt != null
                    ? Date.now() - context.parseStartedAt
                    : null;
                const merged = {
                  ...context,
                  parsedCandidate: event.output.candidate,
                  validationResult: event.output.validationResult,
                };
                const props = buildImportEventProps(merged, {
                  parse_duration_ms: durationMs,
                });
                analytics.track("import_parsed", props);
                analytics.track("import_retake_required", props);
              },
            ],
          },
          {
            target: "previewEdit",
            actions: [
              assign({
                parsedCandidate: ({ event }) => event.output.candidate,
                editedCandidate: ({ event }) => {
                  const c = event.output.candidate;
                  return {
                    title: c.title ?? "",
                    ingredients: c.ingredients,
                    steps: c.steps,
                    description: c.description,
                    servings: c.servings ?? null,
                  };
                },
                validationResult: ({ event }) => event.output.validationResult,
              }),
              ({ context, event }) => {
                const durationMs =
                  context.parseStartedAt != null
                    ? Date.now() - context.parseStartedAt
                    : null;
                const merged = {
                  ...context,
                  parsedCandidate: event.output.candidate,
                  validationResult: event.output.validationResult,
                };
                const props = buildImportEventProps(merged, {
                  parse_duration_ms: durationMs,
                });
                analytics.track("import_parsed", props);
                if (event.output.validationResult?.hasBlockingIssues) {
                  analytics.track("import_blocked_shown", props);
                }
              },
            ],
          },
        ],
        onError: {
          target: "idle",
          actions: [
            assign({
              error: () => "Parsing failed. Please try again.",
            }),
            ({ context, event }) => {
              const durationMs =
                context.parseStartedAt != null
                  ? Date.now() - context.parseStartedAt
                  : null;
              const error = (event as { error?: unknown }).error;
              const message =
                error instanceof Error
                  ? error.message
                  : typeof error === "string"
                    ? error
                    : "Unknown parse error";
              analytics.track(
                "import_failed",
                buildImportEventProps(context, {
                  parse_duration_ms: durationMs,
                  error_message: message,
                  error_stage: "parse",
                }),
              );
            },
          ],
        },
      },
    },

    timedOut: { type: "final" },

    previewEdit: {
      on: {
        EDIT_CANDIDATE: {
          actions: assign({
            editedCandidate: ({ event }) => event.candidate,
            validationResult: ({ event }) => event.validationResult,
          }),
        },
        ATTEMPT_SAVE: {
          guard: ({ context }) =>
            !context.validationResult?.hasBlockingIssues &&
            !context.validationResult?.requiresRetake,
          target: "saving",
        },
      },
    },

    retakeRequired: {
      on: {
        RETAKE_PAGE: {
          target: "capture",
          actions: [
            assign({
              capturedPages: () => [],
              retakePageId: ({ event }) => event.pageId,
            }),
            ({ context, event }) => {
              analytics.track(
                "import_retake_initiated",
                buildImportEventProps(context, { page_id: event.pageId }),
              );
            },
          ],
        },
        RETAKE_SUBMITTED: {
          target: "parsing",
        },
        RETAKE_GO_HOME: {
          target: "idle",
          actions: ({ context }) => {
            analytics.track(
              "import_dismissed",
              buildImportEventProps(context, { dismissed_from: "retakeRequired" }),
            );
          },
        },
      },
    },

    saving: {
      invoke: {
        src: "saveDraft",
        input: ({ context }) => ({ draftId: context.draftId! }),
        onDone: {
          target: "saved",
          actions: [
            assign({
              savedRecipeId: ({ event }) => event.output.recipe.id,
            }),
            ({ context, event }) => {
              analytics.track(
                "import_saved",
                buildImportEventProps(context, {
                  recipe_id: event.output.recipe.id,
                }),
              );
            },
          ],
        },
        onError: {
          target: "previewEdit",
          actions: [
            assign({ error: () => "Save failed. Please try again." }),
            ({ context, event }) => {
              const error = (event as { error?: unknown }).error;
              const message =
                error instanceof Error
                  ? error.message
                  : typeof error === "string"
                    ? error
                    : "Unknown save error";
              analytics.track(
                "import_save_failed",
                buildImportEventProps(context, { error_message: message }),
              );
            },
          ],
        },
      },
    },

    saved: { type: "final" },
  },
});
