import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

export function evaluateRequiredFields(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!candidate.title || candidate.title.trim().length === 0) {
    issues.push({
      issueId: "title-missing",
      code: "TITLE_MISSING",
      severity: "CORRECTION_REQUIRED",
      message: "Recipe title is missing.",
      fieldPath: "title",
      userDismissible: false,
      userResolvable: true,
    });
  }

  const nonHeaderIngredients = candidate.ingredients.filter(
    (i) => !i.isHeader,
  );
  if (nonHeaderIngredients.length === 0) {
    issues.push({
      issueId: "ingredients-missing",
      code: "INGREDIENTS_MISSING",
      severity: "BLOCK",
      message: "No ingredients found.",
      fieldPath: "ingredients",
      userDismissible: false,
      userResolvable: false,
    });
  }

  if (candidate.steps.length === 0) {
    issues.push({
      issueId: "steps-missing",
      code: "STEPS_MISSING",
      severity: "BLOCK",
      message: "No steps found.",
      fieldPath: "steps",
      userDismissible: false,
      userResolvable: false,
    });
  }

  return issues;
}
