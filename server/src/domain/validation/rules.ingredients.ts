import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

export function evaluateIngredients(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const signal of candidate.ingredientSignals) {
    // INGREDIENT_MERGED removed 2026-04-21: every real-world hit was a
    // legitimate compound entry ("salt and pepper to taste"). The signal
    // from the vision model stays in the schema (removing it risks
    // strict-JSON breakage on inflight drafts), but the rule no longer
    // emits a FLAG. See fix/parse-ux-polish-5-bugs.

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
