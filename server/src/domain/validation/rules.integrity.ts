import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

export function evaluateIntegrity(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (candidate.parseSignals.confirmedOmission) {
    issues.push({
      issueId: "confirmed-omission",
      code: "CONFIRMED_OMISSION",
      severity: "BLOCK",
      message: "Content was confirmed to be missing from the source.",
      userDismissible: false,
      userResolvable: false,
    });
  }

  if (candidate.parseSignals.suspectedOmission) {
    issues.push({
      issueId: "suspected-omission",
      code: "SUSPECTED_OMISSION",
      severity: "FLAG",
      message:
        "Some content may be missing. Please review and correct if needed.",
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
        "Multiple recipes were detected in this image. Only one was extracted — please verify the content below is correct.",
      userDismissible: true,
      userResolvable: true,
    });
  }

  return issues;
}
