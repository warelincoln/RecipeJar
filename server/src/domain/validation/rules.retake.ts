import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

const MAX_RETAKES_PER_PAGE = 2;

export function evaluateRetake(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (candidate.parseSignals.lowConfidenceStructure) {
    const allPagesExhausted = candidate.sourcePages.every(
      (p) => (p.retakeCount ?? 0) >= MAX_RETAKES_PER_PAGE,
    );

    if (allPagesExhausted) {
      issues.push({
        issueId: "retake-limit-reached",
        code: "RETAKE_LIMIT_REACHED",
        severity: "BLOCK",
        message:
          "Retake limit reached. Enter guided correction to fix issues manually.",
        userDismissible: false,
        userResolvable: false,
      });
    } else {
      issues.push({
        issueId: "low-confidence-structure",
        code: "LOW_CONFIDENCE_STRUCTURE",
        severity: "RETAKE",
        message:
          "Low confidence in extracted structure. Consider retaking the image.",
        userDismissible: false,
        userResolvable: false,
      });
    }
  }

  if (candidate.parseSignals.poorImageQuality) {
    const allPagesExhausted = candidate.sourcePages.every(
      (p) => (p.retakeCount ?? 0) >= MAX_RETAKES_PER_PAGE,
    );

    if (allPagesExhausted) {
      if (!issues.some((i) => i.code === "RETAKE_LIMIT_REACHED")) {
        issues.push({
          issueId: "retake-limit-reached-quality",
          code: "RETAKE_LIMIT_REACHED",
          severity: "BLOCK",
          message:
            "Retake limit reached due to poor image quality. Enter guided correction.",
          userDismissible: false,
          userResolvable: false,
        });
      }
    } else {
      issues.push({
        issueId: "poor-image-quality",
        code: "POOR_IMAGE_QUALITY",
        severity: "RETAKE",
        message: "Image quality is too low. Please retake the photo.",
        userDismissible: false,
        userResolvable: false,
      });
    }
  }

  return issues;
}
