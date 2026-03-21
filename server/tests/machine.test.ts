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
              hasCorrectionRequiredIssues: false,
              requiresRetake: false,
              canEnterCorrectionMode: false,
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
              hasCorrectionRequiredIssues: false,
              requiresRetake: true,
              canEnterCorrectionMode: true,
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

    it("transitions to guidedCorrection when draft status is IN_GUIDED_CORRECTION", async () => {
      const machine = importMachine.provide({
        actors: {
          resumeDraft: mockActor({
            status: "IN_GUIDED_CORRECTION",
            parsedCandidateJson: { title: "X", ingredients: [], steps: [] },
            editedCandidateJson: { title: "X", ingredients: [], steps: [] },
            validationResultJson: {
              issues: [],
              saveState: "NO_SAVE",
              hasWarnings: false,
              hasBlockingIssues: false,
              hasCorrectionRequiredIssues: true,
              requiresRetake: false,
              canEnterCorrectionMode: true,
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
      expect(snapshot.value).toBe("guidedCorrection");
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
  // Retake escalation → guidedCorrection
  // ----------------------------------------------------------------
  describe("retake escalation to guidedCorrection", () => {
    it("transitions retakeRequired → guidedCorrection via ENTER_CORRECTION", async () => {
      const machine = importMachine.provide({
        actors: {
          createDraft: mockActor({ id: "d1" }),
          parseDraft: mockActor({
            status: "NEEDS_RETAKE",
            candidate: { title: null, ingredients: [], steps: [] },
            validationResult: {
              issues: [{ issueId: "r1", severity: "RETAKE" }],
              saveState: "NO_SAVE",
              hasWarnings: false,
              hasBlockingIssues: false,
              hasCorrectionRequiredIssues: false,
              requiresRetake: true,
              canEnterCorrectionMode: true,
            },
          }),
        },
      });

      const actor = createActor(machine);
      actor.start();

      // Move to capture
      actor.send({ type: "NEW_IMAGE_IMPORT" });
      expect(actor.getSnapshot().value).toBe("capture");

      // Simulate pages + done
      actor.send({ type: "PAGE_CAPTURED", imageUri: "img1.jpg" });
      actor.send({ type: "DONE_CAPTURING" });
      expect(actor.getSnapshot().value).toBe("reorder");

      // Confirm order → parsing (async invoke)
      actor.send({ type: "CONFIRM_ORDER" });
      const afterParse = await waitFor(actor, (s) => s.value !== "parsing", {
        timeout: 1000,
      });
      expect(afterParse.value).toBe("retakeRequired");

      // Escalate to guided correction
      actor.send({ type: "ENTER_CORRECTION" });
      expect(actor.getSnapshot().value).toBe("guidedCorrection");
      actor.stop();
    });
  });

  // ----------------------------------------------------------------
  // Warning gate → saving (SAVE_USER_VERIFIED path)
  // ----------------------------------------------------------------
  describe("warning gate to SAVE_USER_VERIFIED", () => {
    it("transitions previewEdit → finalWarningGate → saving via SAVE_ANYWAY", async () => {
      const savedRecipe = { id: "r1", title: "Flagged Recipe" };

      const machine = importMachine.provide({
        actors: {
          createDraft: mockActor({ id: "d1" }),
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
              hasCorrectionRequiredIssues: false,
              requiresRetake: false,
              canEnterCorrectionMode: false,
            },
          }),
          saveDraft: mockActor({ recipe: savedRecipe, saveDecision: { saveState: "SAVE_USER_VERIFIED" } }),
        },
      });

      const actor = createActor(machine);
      actor.start();

      // Navigate to parsing via image import
      actor.send({ type: "NEW_IMAGE_IMPORT" });
      actor.send({ type: "PAGE_CAPTURED", imageUri: "img.jpg" });
      actor.send({ type: "DONE_CAPTURING" });
      actor.send({ type: "CONFIRM_ORDER" });

      // Wait for parse to complete → previewEdit
      const afterParse = await waitFor(actor, (s) => s.value !== "parsing", {
        timeout: 1000,
      });
      expect(afterParse.value).toBe("previewEdit");

      // ATTEMPT_SAVE with warnings → finalWarningGate
      actor.send({ type: "ATTEMPT_SAVE" });
      expect(actor.getSnapshot().value).toBe("finalWarningGate");

      // SAVE_ANYWAY → saving → saved
      actor.send({ type: "SAVE_ANYWAY" });
      const afterSave = await waitFor(actor, (s) => s.value !== "saving", {
        timeout: 1000,
      });
      expect(afterSave.value).toBe("saved");
      expect(afterSave.context.savedRecipeId).toBe("r1");
      actor.stop();
    });

    it("REVIEW_REQUESTED returns to previewEdit from finalWarningGate", async () => {
      const machine = importMachine.provide({
        actors: {
          createDraft: mockActor({ id: "d1" }),
          parseDraft: mockActor({
            status: "PARSED",
            candidate: {
              title: "Recipe",
              ingredients: [{ id: "i1", text: "x", orderIndex: 0 }],
              steps: [{ id: "s1", text: "y", orderIndex: 0 }],
            },
            validationResult: {
              issues: [
                {
                  issueId: "f1",
                  code: "SUSPECTED_OMISSION",
                  severity: "FLAG",
                  message: "Flag",
                  userDismissible: true,
                  userResolvable: false,
                },
              ],
              saveState: "SAVE_CLEAN",
              hasWarnings: true,
              hasBlockingIssues: false,
              hasCorrectionRequiredIssues: false,
              requiresRetake: false,
              canEnterCorrectionMode: false,
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

      await waitFor(actor, (s) => s.value !== "parsing", { timeout: 1000 });
      actor.send({ type: "ATTEMPT_SAVE" });
      expect(actor.getSnapshot().value).toBe("finalWarningGate");

      actor.send({ type: "REVIEW_REQUESTED" });
      expect(actor.getSnapshot().value).toBe("previewEdit");
      actor.stop();
    });
  });

  // ----------------------------------------------------------------
  // guidedCorrection → previewEdit via CORRECTION_COMPLETE
  // ----------------------------------------------------------------
  describe("guidedCorrection flow", () => {
    it("returns to previewEdit after CORRECTION_COMPLETE", async () => {
      const machine = importMachine.provide({
        actors: {
          createDraft: mockActor({ id: "d1" }),
          parseDraft: mockActor({
            status: "IN_GUIDED_CORRECTION",
            candidate: { title: "X", ingredients: [], steps: [] },
            validationResult: {
              issues: [{ issueId: "c1", severity: "CORRECTION_REQUIRED" }],
              saveState: "NO_SAVE",
              hasWarnings: false,
              hasBlockingIssues: false,
              hasCorrectionRequiredIssues: true,
              requiresRetake: false,
              canEnterCorrectionMode: true,
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

      const afterParse = await waitFor(actor, (s) => s.value !== "parsing", {
        timeout: 1000,
      });
      expect(afterParse.value).toBe("guidedCorrection");

      actor.send({
        type: "CORRECTION_COMPLETE",
        candidate: {
          title: "Fixed Recipe",
          ingredients: [{ id: "i1", text: "flour", orderIndex: 0, isHeader: false }],
          steps: [{ id: "s1", text: "Cook.", orderIndex: 0 }],
        },
      });
      expect(actor.getSnapshot().value).toBe("previewEdit");
      expect(actor.getSnapshot().context.editedCandidate?.title).toBe("Fixed Recipe");
      actor.stop();
    });
  });
});
