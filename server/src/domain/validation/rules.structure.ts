import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

export function evaluateStructure(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!candidate.parseSignals.structureSeparable) {
    // Downgraded from BLOCK to FLAG 2026-04-21. The underlying signal
    // (ingredients and steps couldn't be split cleanly) is useful
    // context but shouldn't gate save — user may have captured
    // deliberately unstructured content (a scrap of narrative, a
    // single-paragraph "grandma's note" style). Let them save + edit.
    issues.push({
      issueId: "structure-not-separable",
      code: "STRUCTURE_NOT_SEPARABLE",
      severity: "FLAG",
      message:
        "We couldn't split ingredients and steps cleanly. Edit them below or save as-is and tidy up later.",
      userDismissible: true,
      userResolvable: true,
    });
  }

  return issues;
}
