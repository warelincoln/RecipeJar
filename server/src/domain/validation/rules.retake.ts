import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

const MAX_RETAKES_PER_PAGE = 2;

export function evaluateRetake(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Retakes only apply to image-based imports. URL imports have sourcePages = [],
  // and Array.every() returns true on an empty array, which was causing
  // RETAKE_LIMIT_REACHED to false-fire on every URL import with low-confidence
  // structure. Short-circuit when there are no pages to retake.
  if (candidate.sourcePages.length === 0) {
    return issues;
  }

  if (candidate.parseSignals.lowConfidenceStructure) {
    const allPagesExhausted = candidate.sourcePages.every(
      (p) => (p.retakeCount ?? 0) >= MAX_RETAKES_PER_PAGE,
    );

    if (allPagesExhausted) {
      // Downgraded from BLOCK to FLAG 2026-04-21. Reaching the retake
      // limit is just a signal that re-capturing isn't going to help
      // anymore — it shouldn't actively block save. The user already
      // sees the flag and can edit manually to fix what needs fixing.
      issues.push({
        issueId: "retake-limit-reached",
        code: "RETAKE_LIMIT_REACHED",
        severity: "FLAG",
        message:
          "You've hit the retake limit. Tidy things up below and save when you're ready.",
        userDismissible: true,
        userResolvable: true,
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
          severity: "FLAG",
          message:
            "Retakes exhausted and the photo's still fuzzy. Edit below to finish up.",
          userDismissible: true,
          userResolvable: true,
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
