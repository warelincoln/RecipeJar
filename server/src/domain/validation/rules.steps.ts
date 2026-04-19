import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

export function evaluateSteps(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Partial-success path: Call B (steps) failed in the split-call adapter
  // but Call A (ingredients) succeeded. Surface a FLAG so the existing
  // warning-banner UI in PreviewEditView renders a "steps couldn't be read"
  // message and the user can edit manually or retake.
  //
  // Gated on steps.length === 0 so the banner disappears once the user
  // types their own steps (at which point the context "extraction failed"
  // is no longer user-relevant). rules.required-fields.ts still emits a
  // BLOCK-severity STEPS_MISSING while steps is empty, so the save button
  // stays disabled until the user fills it in — this FLAG is purely the
  // "why" context on top.
  if (
    candidate.extractionError === "steps_failed" &&
    candidate.steps.length === 0
  ) {
    issues.push({
      issueId: "steps-extraction-failed",
      code: "STEPS_EXTRACTION_FAILED",
      severity: "FLAG",
      message:
        "We couldn't read the step instructions from this photo. Edit them below or retake the page.",
      fieldPath: "steps",
      userDismissible: true,
      userResolvable: true,
    });
  }

  for (const signal of candidate.stepSignals) {
    if (signal.majorOcrArtifact) {
      issues.push({
        issueId: `step-major-ocr-${signal.index}`,
        code: "MAJOR_OCR_ARTIFACT",
        severity: "FLAG",
        message: "The photo may have garbled this step—double-check the wording.",
        fieldPath: `steps[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    } else if (signal.minorOcrArtifact) {
      issues.push({
        issueId: `step-minor-ocr-${signal.index}`,
        code: "MINOR_OCR_ARTIFACT",
        severity: "FLAG",
        message: "Small scan glitch possible here—a quick glance is enough.",
        fieldPath: `steps[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    }
  }

  return issues;
}
