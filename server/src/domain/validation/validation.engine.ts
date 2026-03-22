import type { ParsedRecipeCandidate, ValidationResult } from "@recipejar/shared";
import { evaluateStructure } from "./rules.structure.js";
import { evaluateIntegrity } from "./rules.integrity.js";
import { evaluateRequiredFields } from "./rules.required-fields.js";
import { evaluateIngredients } from "./rules.ingredients.js";
import { evaluateSteps } from "./rules.steps.js";
import { evaluateRetake } from "./rules.retake.js";

export function validateRecipe(
  candidate: ParsedRecipeCandidate,
): ValidationResult {
  const issues = [
    ...evaluateStructure(candidate),
    ...evaluateIntegrity(candidate),
    ...evaluateRequiredFields(candidate),
    ...evaluateIngredients(candidate),
    ...evaluateSteps(candidate),
    ...evaluateRetake(candidate),
  ];

  const hasBlockingIssues = issues.some((i) => i.severity === "BLOCK");
  const requiresRetake = issues.some((i) => i.severity === "RETAKE");
  const hasWarnings = issues.some((i) => i.severity === "FLAG");

  const saveState =
    hasBlockingIssues || requiresRetake ? "NO_SAVE" : "SAVE_CLEAN";

  return {
    issues,
    saveState,
    hasWarnings,
    hasBlockingIssues,
    requiresRetake,
  };
}
