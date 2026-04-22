import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

export function evaluateIntegrity(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (candidate.parseSignals.confirmedOmission) {
    // Downgraded from BLOCK to FLAG 2026-04-21. The signal is worth
    // surfacing (framing cut off content) but the user might be fine
    // saving a partial recipe and filling the gap from the physical
    // book later — forcing a retake or edit here is paternalistic.
    issues.push({
      issueId: "confirmed-omission",
      code: "CONFIRMED_OMISSION",
      severity: "FLAG",
      message:
        "Looks like part of the page was cut off. Fill in what's missing, or save as-is and add it later.",
      userDismissible: true,
      userResolvable: true,
    });
  }

  if (candidate.parseSignals.suspectedOmission) {
    issues.push({
      issueId: "suspected-omission",
      code: "SUSPECTED_OMISSION",
      severity: "FLAG",
      message:
        "We might be missing a bit of the recipe—peek at the photo and tweak if needed.",
      userDismissible: true,
      userResolvable: true,
    });
  }

  if (candidate.parseSignals.multiRecipeDetected) {
    issues.push({
      issueId: "multi-recipe-detected",
      code: "MULTI_RECIPE_DETECTED",
      severity: "FLAG",
      message:
        "We may have picked up more than one recipe—make sure what's below matches what you want.",
      userDismissible: true,
      userResolvable: true,
    });
  }

  return issues;
}
