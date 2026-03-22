// @ts-nocheck — Cross-package import; actors use partial mock data intentionally.
/**
 * XState machine tests for the import flow.
 *
 * These tests verify state machine transitions using the actual machine
 * definition from the mobile package. Actors are overridden with mock
 * implementations via machine.provide() — no network or API calls occur.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor, waitFor, fromPromise } from "xstate";

vi.mock("../../mobile/src/services/api", () => ({
  api: {},
}));

import { importMachine } from "../../mobile/src/features/import/machine";

function mockActor(result: unknown) {
  return fromPromise(async () => result) as any;
}

function failingActor(msg = "fail") {
  return fromPromise(async () => {
    throw new Error(msg);
  }) as any;
}

describe("Import flow XState machine", () => {
  // ----------------------------------------------------------------
  // Resume → previewEdit
  // ----------------------------------------------------------------
  describe("resume to previewEdit", () => {
    it("transitions idle → resuming → previewEdit when draft status is PARSED", async () => {
      const machine = importMachine.provide({
        actors: {
          resumeDraft: mockActor({
            status: "PARSED",
            parsedCandidateJson: {
              title: "Pasta",
              ingredients: [{ id: "i1", text: "noodles", orderIndex: 0 }],
              steps: [{ id: "s1", text: "Boil.", orderIndex: 0 }],
            },
            editedCandidateJson: {
              title: "Pasta",
              ingredients: [{ id: "i1", text: "noodles", orderIndex: 0, isHeader: false }],
              steps: [{ id: "s1", text: "Boil.", orderIndex: 0 }],
            },
            validationResultJson: {
              issues: [],
              saveState: "SAVE_CLEAN",
              hasWarnings: false,
              hasBlockingIssues: false,
              requiresRetake: false,
            },
          }),
        },
      });

      const actor = createActor(machine);
      actor.start();
      expect(actor.getSnapshot().value).toBe("idle");

      actor.send({ type: "RESUME_DRAFT", draftId: "d1" });

      const snapshot = await waitFor(actor, (s) => s.value !== "resuming", {
        timeout: 1000,
      });
      expect(snapshot.value).toBe("previewEdit");
      expect(snapshot.context.draftId).toBe("d1");
      expect(snapshot.context.parsedCandidate).toBeDefined();
      expect(snapshot.context.editedCandidate).toBeDefined();
      actor.stop();
    });

    it("transitions to retakeRequired when draft status is NEEDS_RETAKE", async () => {
      const machine = importMachine.provide({
        actors: {
          resumeDraft: mockActor({
            status: "NEEDS_RETAKE",
            parsedCandidateJson: { title: null, ingredients: [], steps: [] },
            validationResultJson: {
              issues: [{ issueId: "r1", code: "POOR_IMAGE_QUALITY", severity: "RETAKE" }],
              saveState: "NO_SAVE",
              hasWarnings: false,
              hasBlockingIssues: false,
              requiresRetake: true,
            },
          }),
        },
      });

      const actor = createActor(machine);
      actor.start();
      actor.send({ type: "RESUME_DRAFT", draftId: "d2" });

      const snapshot = await waitFor(actor, (s) => s.value !== "resuming", {
        timeout: 1000,
      });
      expect(snapshot.value).toBe("retakeRequired");
      actor.stop();
    });

    it("IN_GUIDED_CORRECTION resumes to previewEdit", async () => {
      const machine = importMachine.provide({
        actors: {
          resumeDraft: mockActor({
            status: "IN_GUIDED_CORRECTION",
            parsedCandidateJson: { title: "X", ingredients: [], steps: [] },
            editedCandidateJson: { title: "X", ingredients: [], steps: [] },
            validationResultJson: {
              issues: [],
              saveState: "SAVE_CLEAN",
              hasWarnings: false,
              hasBlockingIssues: false,
              requiresRetake: false,
            },
          }),
        },
      });

      const actor = createActor(machine);
      actor.start();
      actor.send({ type: "RESUME_DRAFT", draftId: "d3" });

      const snapshot = await waitFor(actor, (s) => s.value !== "resuming", {
        timeout: 1000,
      });
      expect(snapshot.value).toBe("previewEdit");
      actor.stop();
    });

    it("falls back to capture on resume error", async () => {
      const machine = importMachine.provide({
        actors: { resumeDraft: failingActor("network error") },
      });

      const actor = createActor(machine);
      actor.start();
      actor.send({ type: "RESUME_DRAFT", draftId: "d4" });

      const snapshot = await waitFor(actor, (s) => s.value !== "resuming", {
        timeout: 1000,
      });
      expect(snapshot.value).toBe("idle");
      expect(snapshot.context.error).toBe("Failed to resume draft");
      actor.stop();
    });
  });

  // ----------------------------------------------------------------
  // Image import → upload → parse → previewEdit → save
  // ----------------------------------------------------------------
  describe("full image import flow", () => {
    it("capture → reorder → uploading → parsing → previewEdit → saving → saved", async () => {
      const savedRecipe = { id: "r1", title: "Test Recipe" };

      const machine = importMachine.provide({
        actors: {
          uploadDraft: mockActor({ draftId: "d1", pages: [] }),
          parseDraft: mockActor({
            status: "PARSED",
            candidate: {
              title: "Test Recipe",
              ingredients: [{ id: "i1", text: "flour", orderIndex: 0 }],
              steps: [{ id: "s1", text: "Mix.", orderIndex: 0 }],
            },
            validationResult: {
              issues: [],
              saveState: "SAVE_CLEAN",
              hasWarnings: false,
              hasBlockingIssues: false,
              requiresRetake: false,
            },
          }),
          saveDraft: mockActor({ recipe: savedRecipe, saveDecision: { saveState: "SAVE_CLEAN" } }),
        },
      });

      const actor = createActor(machine);
      actor.start();

      actor.send({ type: "NEW_IMAGE_IMPORT" });
      expect(actor.getSnapshot().value).toBe("capture");

      actor.send({ type: "PAGE_CAPTURED", imageUri: "img1.jpg" });
      actor.send({ type: "DONE_CAPTURING" });
      expect(actor.getSnapshot().value).toBe("reorder");

      actor.send({ type: "CONFIRM_ORDER" });

      const afterUpload = await waitFor(actor, (s) => s.value !== "uploading", {
        timeout: 1000,
      });

      const afterParse = await waitFor(actor, (s) => s.value !== "parsing", {
        timeout: 1000,
      });
      expect(afterParse.value).toBe("previewEdit");

      actor.send({ type: "ATTEMPT_SAVE" });
      const afterSave = await waitFor(actor, (s) => s.value !== "saving", {
        timeout: 1000,
      });
      expect(afterSave.value).toBe("saved");
      expect(afterSave.context.savedRecipeId).toBe("r1");
      actor.stop();
    });
  });

  // ----------------------------------------------------------------
  // ATTEMPT_SAVE with warnings → direct save (no warning gate)
  // ----------------------------------------------------------------
  describe("ATTEMPT_SAVE with warnings saves directly", () => {
    it("transitions previewEdit → saving → saved even with FLAG warnings", async () => {
      const savedRecipe = { id: "r1", title: "Flagged Recipe" };

      const machine = importMachine.provide({
        actors: {
          uploadDraft: mockActor({ draftId: "d1", pages: [] }),
          parseDraft: mockActor({
            status: "PARSED",
            candidate: {
              title: "Flagged Recipe",
              ingredients: [{ id: "i1", text: "flour", orderIndex: 0 }],
              steps: [{ id: "s1", text: "Mix.", orderIndex: 0 }],
            },
            validationResult: {
              issues: [
                {
                  issueId: "f1",
                  code: "SUSPECTED_OMISSION",
                  severity: "FLAG",
                  message: "Possible missing",
                  userDismissible: true,
                  userResolvable: false,
                },
              ],
              saveState: "SAVE_CLEAN",
              hasWarnings: true,
              hasBlockingIssues: false,
              requiresRetake: false,
            },
          }),
          saveDraft: mockActor({ recipe: savedRecipe, saveDecision: { saveState: "SAVE_USER_VERIFIED" } }),
        },
      });

      const actor = createActor(machine);
      actor.start();

      actor.send({ type: "NEW_IMAGE_IMPORT" });
      actor.send({ type: "PAGE_CAPTURED", imageUri: "img.jpg" });
      actor.send({ type: "DONE_CAPTURING" });
      actor.send({ type: "CONFIRM_ORDER" });

      await waitFor(actor, (s) => s.value === "previewEdit", { timeout: 2000 });

      actor.send({ type: "ATTEMPT_SAVE" });
      const afterSave = await waitFor(actor, (s) => s.value !== "saving", {
        timeout: 1000,
      });
      expect(afterSave.value).toBe("saved");
      expect(afterSave.context.savedRecipeId).toBe("r1");
      actor.stop();
    });
  });

  // ----------------------------------------------------------------
  // ATTEMPT_SAVE blocked when hasBlockingIssues
  // ----------------------------------------------------------------
  describe("ATTEMPT_SAVE blocked", () => {
    it("stays in previewEdit when blocking issues exist", async () => {
      const machine = importMachine.provide({
        actors: {
          uploadDraft: mockActor({ draftId: "d1", pages: [] }),
          parseDraft: mockActor({
            status: "PARSED",
            candidate: {
              title: "Recipe",
              ingredients: [],
              steps: [],
            },
            validationResult: {
              issues: [{ issueId: "b1", code: "INGREDIENTS_MISSING", severity: "BLOCK" }],
              saveState: "NO_SAVE",
              hasWarnings: false,
              hasBlockingIssues: true,
              requiresRetake: false,
            },
          }),
        },
      });

      const actor = createActor(machine);
      actor.start();

      actor.send({ type: "NEW_IMAGE_IMPORT" });
      actor.send({ type: "PAGE_CAPTURED", imageUri: "img.jpg" });
      actor.send({ type: "DONE_CAPTURING" });
      actor.send({ type: "CONFIRM_ORDER" });

      await waitFor(actor, (s) => s.value === "previewEdit", { timeout: 2000 });

      actor.send({ type: "ATTEMPT_SAVE" });
      expect(actor.getSnapshot().value).toBe("previewEdit");
      actor.stop();
    });
  });

  // ----------------------------------------------------------------
  // URL import flow
  // ----------------------------------------------------------------
  describe("URL import flow", () => {
    it("idle → creatingUrlDraft → parsing → previewEdit", async () => {
      const machine = importMachine.provide({
        actors: {
          createUrlDraft: mockActor({ id: "url-d1" }),
          parseDraft: mockActor({
            status: "PARSED",
            candidate: {
              title: "URL Recipe",
              ingredients: [{ id: "i1", text: "flour", orderIndex: 0 }],
              steps: [{ id: "s1", text: "Mix.", orderIndex: 0 }],
            },
            validationResult: {
              issues: [],
              saveState: "SAVE_CLEAN",
              hasWarnings: false,
              hasBlockingIssues: false,
              requiresRetake: false,
            },
          }),
        },
      });

      const actor = createActor(machine);
      actor.start();

      actor.send({ type: "NEW_URL_IMPORT", url: "https://example.com/recipe" });

      const snapshot = await waitFor(actor, (s) => s.value === "previewEdit", {
        timeout: 2000,
      });
      expect(snapshot.value).toBe("previewEdit");
      expect(snapshot.context.draftId).toBe("url-d1");
      expect(snapshot.context.sourceType).toBe("url");
      actor.stop();
    });
  });
});
