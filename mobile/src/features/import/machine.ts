import { setup, assign, fromPromise } from "xstate";
import { api } from "../../services/api";
import type {
  ParsedRecipeCandidate,
  EditedRecipeCandidate,
  ValidationResult,
  DraftStatus,
} from "@recipejar/shared";

export interface ImportContext {
  draftId: string | null;
  sourceType: "image" | "url";
  url: string | null;
  capturedPages: { pageId: string; imageUri: string; orderIndex: number }[];
  parsedCandidate: ParsedRecipeCandidate | null;
  editedCandidate: EditedRecipeCandidate | null;
  validationResult: ValidationResult | null;
  retakePageId: string | null;
  savedRecipeId: string | null;
  error: string | null;
}

type ImportEvent =
  | { type: "NEW_IMAGE_IMPORT" }
  | { type: "NEW_URL_IMPORT"; url: string }
  | { type: "RESUME_DRAFT"; draftId: string }
  | { type: "PAGE_CAPTURED"; imageUri: string }
  | { type: "DONE_CAPTURING" }
  | { type: "CONFIRM_ORDER" }
  | { type: "EDIT_CANDIDATE"; candidate: EditedRecipeCandidate }
  | { type: "ATTEMPT_SAVE" }
  | { type: "RETAKE_SUBMITTED"; imageUri: string }
  | { type: "RETAKE_PAGE" }
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
};

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
        input: { pages: { imageUri: string; orderIndex: number }[] };
      }) => {
        const draft = await api.drafts.create();
        const uploadedPages = [];
        for (const page of input.pages) {
          const uploaded = await api.drafts.addPage(draft.id, page.imageUri);
          uploadedPages.push(uploaded);
        }
        return { draftId: draft.id, pages: uploadedPages };
      },
    ),
    parseDraft: fromPromise(
      async ({ input }: { input: { draftId: string } }) => {
        return api.drafts.parse(input.draftId);
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
    url: null,
    capturedPages: [],
    parsedCandidate: null,
    editedCandidate: null,
    validationResult: null,
    retakePageId: null,
    savedRecipeId: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        NEW_IMAGE_IMPORT: { target: "capture" },
        NEW_URL_IMPORT: {
          target: "creatingUrlDraft",
          actions: assign({
            sourceType: () => "url" as const,
            url: ({ event }) => event.url,
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
              parsedCandidate: ({ event }) =>
                (event.output.parsedCandidateJson as ParsedRecipeCandidate) ?? null,
              validationResult: ({ event }) =>
                (event.output.validationResultJson as ValidationResult) ?? null,
            }),
          },
          {
            guard: ({ event }) =>
              STATUS_TO_STATE[event.output.status as DraftStatus] === "previewEdit",
            target: "previewEdit",
            actions: assign({
              parsedCandidate: ({ event }) =>
                (event.output.parsedCandidateJson as ParsedRecipeCandidate) ?? null,
              editedCandidate: ({ event }) =>
                (event.output.editedCandidateJson as EditedRecipeCandidate) ?? null,
              validationResult: ({ event }) =>
                (event.output.validationResultJson as ValidationResult) ?? null,
            }),
          },
          {
            guard: ({ event }) =>
              STATUS_TO_STATE[event.output.status as DraftStatus] ===
              "retakeRequired",
            target: "retakeRequired",
            actions: assign({
              parsedCandidate: ({ event }) =>
                (event.output.parsedCandidateJson as ParsedRecipeCandidate) ?? null,
              validationResult: ({ event }) =>
                (event.output.validationResultJson as ValidationResult) ?? null,
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
      after: {
        60000: {
          target: "timedOut",
          actions: assign({
            error: () => "This is taking longer than expected. Please try again.",
          }),
        },
      },
      invoke: {
        src: "parseDraft",
        input: ({ context }) => ({ draftId: context.draftId! }),
        onDone: [
          {
            guard: ({ event }) => event.output.status === "NEEDS_RETAKE",
            target: "retakeRequired",
            actions: assign({
              parsedCandidate: ({ event }) => event.output.candidate,
              validationResult: ({ event }) => event.output.validationResult,
            }),
          },
          {
            target: "previewEdit",
            actions: assign({
              parsedCandidate: ({ event }) => event.output.candidate,
              editedCandidate: ({ event }) => {
                const c = event.output.candidate;
                return {
                  title: c.title ?? "",
                  ingredients: c.ingredients,
                  steps: c.steps,
                  description: c.description,
                };
              },
              validationResult: ({ event }) => event.output.validationResult,
            }),
          },
        ],
        onError: {
          target: "idle",
          actions: assign({
            error: () => "Parsing failed. Please try again.",
          }),
        },
      },
    },

    timedOut: { type: "final" },

    previewEdit: {
      on: {
        EDIT_CANDIDATE: {
          actions: assign({
            editedCandidate: ({ event }) => event.candidate,
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
          actions: assign({
            capturedPages: () => [],
          }),
        },
        RETAKE_SUBMITTED: {
          target: "parsing",
        },
      },
    },

    saving: {
      invoke: {
        src: "saveDraft",
        input: ({ context }) => ({ draftId: context.draftId! }),
        onDone: {
          target: "saved",
          actions: assign({
            savedRecipeId: ({ event }) => event.output.recipe.id,
          }),
        },
        onError: {
          target: "previewEdit",
          actions: assign({ error: () => "Save failed. Please try again." }),
        },
      },
    },

    saved: { type: "final" },
  },
});
