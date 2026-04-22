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
    // Downgraded from RETAKE to FLAG 2026-04-21 (follow-up to the Bug 1
    // BLOCK→FLAG pass). The model fires this signal on any page it
    // considers structurally uncertain — which includes legitimate
    // ingredient-only screenshots (no steps visible). Forcing retake on
    // those is exactly the friction the user called out: "a clear
    // screenshot of an ingredient list should populate a recipe without
    // a title, not be rejected." Retaking a clear screenshot doesn't
    // change anything; the structure signal is about content, not the
    // photo. FLAG + dismissible lets the user land on PreviewEdit and
    // save what they captured. POOR_IMAGE_QUALITY below stays as RETAKE
    // because that IS about the photo (blurry, unreadable) and retaking
    // legitimately helps (e.g. better lighting on a cookbook page).
    issues.push({
      issueId: "low-confidence-structure",
      code: "LOW_CONFIDENCE_STRUCTURE",
      severity: "FLAG",
      message:
        "This one's a bit unusual — no clear steps or standard recipe layout. Double-check what we captured below.",
      userDismissible: true,
      userResolvable: true,
    });
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
