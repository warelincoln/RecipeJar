import { describe, it, expect } from "vitest";
import { decideSave } from "../src/domain/save-decision.js";
import type { ValidationResult } from "@recipejar/shared";

function makeCleanResult(
  overrides: Partial<ValidationResult> = {},
): ValidationResult {
  return {
    issues: [],
    saveState: "SAVE_CLEAN",
    hasWarnings: false,
    hasBlockingIssues: false,
    hasCorrectionRequiredIssues: false,
    requiresRetake: false,
    canEnterCorrectionMode: false,
    ...overrides,
  };
}

describe("decideSave", () => {
  it("clean result with no warnings -> SAVE_CLEAN", () => {
    const decision = decideSave({
      validationResult: makeCleanResult(),
      dismissedIssueIds: [],
    });
    expect(decision.saveState).toBe("SAVE_CLEAN");
    expect(decision.isUserVerified).toBe(false);
    expect(decision.allowed).toBe(true);
    expect(decision.hasUnresolvedWarnings).toBe(false);
  });

  it("SAVE_CLEAN allowed with undismissed FLAG warnings", () => {
    const decision = decideSave({
      validationResult: makeCleanResult({
        hasWarnings: true,
        issues: [
          {
            issueId: "flag-1",
            code: "INGREDIENT_QTY_OR_UNIT_MISSING",
            severity: "FLAG",
            message: "Missing qty",
            fieldPath: "ingredients[0]",
            userDismissible: true,
            userResolvable: true,
          },
        ],
      }),
      dismissedIssueIds: [],
    });
    expect(decision.saveState).toBe("SAVE_CLEAN");
    expect(decision.allowed).toBe(true);
    expect(decision.hasUnresolvedWarnings).toBe(true);
    expect(decision.isUserVerified).toBe(false);
  });

  it("warning dismissal changes outcome to SAVE_USER_VERIFIED", () => {
    const decision = decideSave({
      validationResult: makeCleanResult({
        hasWarnings: true,
        issues: [
          {
            issueId: "flag-1",
            code: "INGREDIENT_QTY_OR_UNIT_MISSING",
            severity: "FLAG",
            message: "Missing qty",
            fieldPath: "ingredients[0]",
            userDismissible: true,
            userResolvable: true,
          },
        ],
      }),
      dismissedIssueIds: ["flag-1"],
    });
    expect(decision.saveState).toBe("SAVE_USER_VERIFIED");
    expect(decision.isUserVerified).toBe(true);
    expect(decision.allowed).toBe(true);
    expect(decision.hasUnresolvedWarnings).toBe(false);
  });

  it("NO_SAVE when BLOCK exists", () => {
    const decision = decideSave({
      validationResult: makeCleanResult({
        saveState: "NO_SAVE",
        hasBlockingIssues: true,
        issues: [
          {
            issueId: "block-1",
            code: "INGREDIENTS_MISSING",
            severity: "BLOCK",
            message: "No ingredients",
            userDismissible: false,
            userResolvable: false,
          },
        ],
      }),
      dismissedIssueIds: [],
    });
    expect(decision.saveState).toBe("NO_SAVE");
    expect(decision.allowed).toBe(false);
  });

  it("NO_SAVE when CORRECTION_REQUIRED exists", () => {
    const decision = decideSave({
      validationResult: makeCleanResult({
        saveState: "NO_SAVE",
        hasCorrectionRequiredIssues: true,
        issues: [
          {
            issueId: "corr-1",
            code: "TITLE_MISSING",
            severity: "CORRECTION_REQUIRED",
            message: "Title missing",
            userDismissible: false,
            userResolvable: true,
          },
        ],
      }),
      dismissedIssueIds: [],
    });
    expect(decision.saveState).toBe("NO_SAVE");
    expect(decision.allowed).toBe(false);
  });

  it("NO_SAVE when retake required", () => {
    const decision = decideSave({
      validationResult: makeCleanResult({
        saveState: "NO_SAVE",
        requiresRetake: true,
        issues: [
          {
            issueId: "retake-1",
            code: "LOW_CONFIDENCE_STRUCTURE",
            severity: "RETAKE",
            message: "Low confidence",
            userDismissible: false,
            userResolvable: false,
          },
        ],
      }),
      dismissedIssueIds: [],
    });
    expect(decision.saveState).toBe("NO_SAVE");
    expect(decision.allowed).toBe(false);
  });

  it("partial warning dismissal -> SAVE_USER_VERIFIED with unresolved warnings", () => {
    const decision = decideSave({
      validationResult: makeCleanResult({
        hasWarnings: true,
        issues: [
          {
            issueId: "flag-1",
            code: "INGREDIENT_QTY_OR_UNIT_MISSING",
            severity: "FLAG",
            message: "Missing qty",
            userDismissible: true,
            userResolvable: true,
          },
          {
            issueId: "flag-2",
            code: "MINOR_OCR_ARTIFACT",
            severity: "FLAG",
            message: "Minor OCR",
            userDismissible: true,
            userResolvable: true,
          },
        ],
      }),
      dismissedIssueIds: ["flag-1"],
    });
    expect(decision.saveState).toBe("SAVE_USER_VERIFIED");
    expect(decision.isUserVerified).toBe(true);
    expect(decision.hasUnresolvedWarnings).toBe(true);
  });

  it("SAVE_CLEAN does not require zero FLAGs", () => {
    const decision = decideSave({
      validationResult: makeCleanResult({
        hasWarnings: true,
        issues: [
          {
            issueId: "flag-1",
            code: "DESCRIPTION_DETECTED",
            severity: "FLAG",
            message: "Description found",
            userDismissible: true,
            userResolvable: true,
          },
        ],
      }),
      dismissedIssueIds: [],
    });
    expect(decision.saveState).toBe("SAVE_CLEAN");
    expect(decision.allowed).toBe(true);
  });
});
