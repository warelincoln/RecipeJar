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
      message:
        "Some of the recipe may not have made it off the page—fill in what's missing before saving.",
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
