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
        "Cannot separate ingredients and steps from the source content.",
      userDismissible: false,
      userResolvable: false,
    });
  }

  return issues;
}
