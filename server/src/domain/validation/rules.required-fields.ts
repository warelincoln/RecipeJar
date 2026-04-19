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

  // Ingredient-only recipes are a legitimate use case — lots of people
  // screenshot just the ingredient list. Downgraded from BLOCK to FLAG so
  // the recipe saves without forcing the user to invent steps. If the
  // extractionError flag is set ("we couldn't read the steps"), rules.steps.ts
  // emits a more-specific STEPS_EXTRACTION_FAILED instead — skip this rule
  // then to avoid double-flagging the same empty-steps condition with two
  // different messages.
  if (
    candidate.steps.length === 0 &&
    candidate.extractionError !== "steps_failed"
  ) {
    issues.push({
      issueId: "steps-missing",
      code: "STEPS_MISSING",
      severity: "FLAG",
      message:
        "No step instructions yet. You can save ingredients-only or add steps below.",
      fieldPath: "steps",
      userDismissible: true,
      userResolvable: true,
    });
  }

  return issues;
}
