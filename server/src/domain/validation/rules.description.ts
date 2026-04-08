import type { ParsedRecipeCandidate } from "@orzo/shared";
import type { ValidationIssue } from "@orzo/shared";

export function evaluateDescription(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (candidate.parseSignals.descriptionDetected) {
    issues.push({
      issueId: "description-detected",
      code: "DESCRIPTION_DETECTED",
      severity: "FLAG",
      message:
        "There's a short blurb here—keep it or remove it if you don't want it.",
      fieldPath: "description",
      userDismissible: true,
      userResolvable: true,
    });
  }

  return issues;
}
