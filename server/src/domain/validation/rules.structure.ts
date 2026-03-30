import type { ParsedRecipeCandidate } from "@recipejar/shared";
import type { ValidationIssue } from "@recipejar/shared";

export function evaluateStructure(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!candidate.parseSignals.structureSeparable) {
    issues.push({
      issueId: "structure-not-separable",
      code: "STRUCTURE_NOT_SEPARABLE",
      severity: "BLOCK",
      message:
        "We couldn't split ingredients and steps cleanly—edit them in manually to save.",
      userDismissible: false,
      userResolvable: false,
    });
  }

  return issues;
}
