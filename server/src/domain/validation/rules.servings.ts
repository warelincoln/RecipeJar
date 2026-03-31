import type { ParsedRecipeCandidate, ValidationIssue } from "@recipejar/shared";

export function evaluateServings(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  if (candidate.servings != null && candidate.servings > 0) {
    return [];
  }

  return [
    {
      issueId: "servings-missing",
      code: "SERVINGS_MISSING",
      severity: "BLOCK",
      message:
        "How many does this recipe serve? Add the number of servings to save.",
      fieldPath: "servings",
      userDismissible: false,
      userResolvable: true,
    },
  ];
}
