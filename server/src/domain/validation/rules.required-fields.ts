import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

export function evaluateRequiredFields(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!candidate.title || candidate.title.trim().length === 0) {
    issues.push({
      issueId: "title-missing",
      code: "TITLE_MISSING",
      severity: "FLAG",
      message: "We don't see a title yet—add one if it's missing.",
      fieldPath: "title",
      userDismissible: true,
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
      message: "We couldn't find ingredient lines—add a few so you can save.",
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
      message: "We couldn't find steps—add them so you can save.",
      fieldPath: "steps",
      userDismissible: false,
      userResolvable: false,
    });
  }

  return issues;
}
