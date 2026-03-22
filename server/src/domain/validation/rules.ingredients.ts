import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

export function evaluateIngredients(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const signal of candidate.ingredientSignals) {
    if (signal.mergedWhenSeparable) {
      issues.push({
        issueId: `ingredient-merged-${signal.index}`,
        code: "INGREDIENT_MERGED",
        severity: "FLAG",
        message: `Ingredient at position ${signal.index} appears to contain merged entries that can be separated.`,
        fieldPath: `ingredients[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    }

    if (signal.missingName) {
      issues.push({
        issueId: `ingredient-name-missing-${signal.index}`,
        code: "INGREDIENT_NAME_MISSING",
        severity: "FLAG",
        message: `Ingredient at position ${signal.index} is missing a name.`,
        fieldPath: `ingredients[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    }

    if (signal.majorOcrArtifact) {
      issues.push({
        issueId: `ingredient-major-ocr-${signal.index}`,
        code: "MAJOR_OCR_ARTIFACT",
        severity: "FLAG",
        message: `Ingredient at position ${signal.index} has a significant OCR artifact that may affect meaning.`,
        fieldPath: `ingredients[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    } else if (signal.minorOcrArtifact) {
      issues.push({
        issueId: `ingredient-minor-ocr-${signal.index}`,
        code: "MINOR_OCR_ARTIFACT",
        severity: "FLAG",
        message: `Ingredient at position ${signal.index} has a minor OCR artifact.`,
        fieldPath: `ingredients[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    }
  }

  return issues;
}
