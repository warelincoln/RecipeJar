import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

export function evaluateSteps(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const signal of candidate.stepSignals) {
    if (signal.mergedWhenSeparable) {
      issues.push({
        issueId: `step-merged-${signal.index}`,
        code: "STEP_MERGED",
        severity: "CORRECTION_REQUIRED",
        message: `Step at position ${signal.index} appears to contain merged steps that can be separated.`,
        fieldPath: `steps[${signal.index}]`,
        userDismissible: false,
        userResolvable: true,
      });
    }

    if (signal.majorOcrArtifact) {
      issues.push({
        issueId: `step-major-ocr-${signal.index}`,
        code: "MAJOR_OCR_ARTIFACT",
        severity: "CORRECTION_REQUIRED",
        message: `Step at position ${signal.index} has a significant OCR artifact that may affect meaning.`,
        fieldPath: `steps[${signal.index}]`,
        userDismissible: false,
        userResolvable: true,
      });
    } else if (signal.minorOcrArtifact) {
      issues.push({
        issueId: `step-minor-ocr-${signal.index}`,
        code: "MINOR_OCR_ARTIFACT",
        severity: "FLAG",
        message: `Step at position ${signal.index} has a minor OCR artifact.`,
        fieldPath: `steps[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    }
  }

  return issues;
}
