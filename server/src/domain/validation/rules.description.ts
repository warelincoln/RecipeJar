import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

export function evaluateDescription(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (candidate.parseSignals.descriptionDetected) {
    issues.push({
      issueId: "description-detected",
      code: "DESCRIPTION_DETECTED",
      severity: "FLAG",
      message:
        "A description was detected. Confirm whether to include it with the recipe.",
      fieldPath: "description",
      userDismissible: true,
      userResolvable: true,
    });
  }

  return issues;
}
