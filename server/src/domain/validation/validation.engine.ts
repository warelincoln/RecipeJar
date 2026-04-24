import type { ParsedRecipeCandidate, ValidationResult } from "@orzo/shared";
import { evaluateStructure } from "./rules.structure.js";
import { evaluateIntegrity } from "./rules.integrity.js";
import { evaluateRequiredFields } from "./rules.required-fields.js";
import { evaluateIngredients } from "./rules.ingredients.js";
import { evaluateSteps } from "./rules.steps.js";
import { evaluateRetake } from "./rules.retake.js";
import { evaluateServings } from "./rules.servings.js";
import { evaluateExtractionError } from "./rules.extraction-error.js";

export function validateRecipe(
  candidate: ParsedRecipeCandidate,
): ValidationResult {
  const extractionErrorIssues = evaluateExtractionError(candidate);
  const hasBotBlock = extractionErrorIssues.some(
    (i) => i.code === "URL_BOT_BLOCKED",
  );

  // When the URL is bot-blocked the candidate is empty; suppress the
  // downstream MISSING-field rules so the user sees the one actionable
  // message instead of a stack of noise.
  const issues = hasBotBlock
    ? extractionErrorIssues
    : [
        ...extractionErrorIssues,
        ...evaluateStructure(candidate),
        ...evaluateIntegrity(candidate),
        ...evaluateRequiredFields(candidate),
        ...evaluateServings(candidate),
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
