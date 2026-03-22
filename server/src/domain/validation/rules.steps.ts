import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

export function evaluateSteps(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const signal of candidate.stepSignals) {
    if (signal.majorOcrArtifact) {
      issues.push({
        issueId: `step-major-ocr-${signal.index}`,
        code: "MAJOR_OCR_ARTIFACT",
        severity: "FLAG",
        message: `Step at position ${signal.index} has a significant OCR artifact that may affect meaning.`,
        fieldPath: `steps[${signal.index}]`,
        userDismissible: true,
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
