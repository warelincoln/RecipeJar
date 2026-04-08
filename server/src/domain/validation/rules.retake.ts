import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

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
          "You've used the max retakes—tidy things up below, then save when you're ready.",
        userDismissible: false,
        userResolvable: false,
      });
    } else {
      issues.push({
        issueId: "low-confidence-structure",
        code: "LOW_CONFIDENCE_STRUCTURE",
        severity: "RETAKE",
        message:
          "We're not quite confident in the layout—a clearer photo usually helps.",
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
            "Max retakes reached and the photo's still fuzzy—edit below to finish up.",
          userDismissible: false,
          userResolvable: false,
        });
      }
    } else {
      issues.push({
        issueId: "poor-image-quality",
        code: "POOR_IMAGE_QUALITY",
        severity: "RETAKE",
        message: "This shot's a bit hard to read—try another photo if you can.",
        userDismissible: false,
        userResolvable: false,
      });
    }
  }

  return issues;
}
