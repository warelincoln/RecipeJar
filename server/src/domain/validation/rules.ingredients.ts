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
        message:
          "This line may combine two ingredients—split it if that looks right.",
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
        message:
          "We couldn't spot an ingredient name on this line—give it a quick look.",
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
        message: "The photo may have garbled this line—double-check the wording.",
        fieldPath: `ingredients[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    } else if (signal.minorOcrArtifact) {
      issues.push({
        issueId: `ingredient-minor-ocr-${signal.index}`,
        code: "MINOR_OCR_ARTIFACT",
        severity: "FLAG",
        message: "Small scan glitch possible here—a quick glance is enough.",
        fieldPath: `ingredients[${signal.index}]`,
        userDismissible: true,
        userResolvable: true,
      });
    }
  }

  return issues;
}
