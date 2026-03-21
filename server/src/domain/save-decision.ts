import type { ValidationResult, SaveDecision } from "@recipejar/shared";

export function decideSave(input: {
  validationResult: ValidationResult;
  dismissedIssueIds: string[];
}): SaveDecision {
  const { validationResult, dismissedIssueIds } = input;

  if (
    validationResult.hasBlockingIssues ||
    validationResult.hasCorrectionRequiredIssues ||
    validationResult.requiresRetake
  ) {
    return {
      saveState: "NO_SAVE",
      isUserVerified: false,
      hasUnresolvedWarnings: validationResult.hasWarnings,
      allowed: false,
    };
  }

  const dismissedSet = new Set(dismissedIssueIds);
  const flags = validationResult.issues.filter((i) => i.severity === "FLAG");
  const dismissedFlags = flags.filter((f) => dismissedSet.has(f.issueId));
  const undismissedFlags = flags.filter((f) => !dismissedSet.has(f.issueId));

  const hasAnyDismissedFlag = dismissedFlags.length > 0;
  const hasUnresolvedWarnings = undismissedFlags.length > 0;

  if (hasAnyDismissedFlag) {
    return {
      saveState: "SAVE_USER_VERIFIED",
      isUserVerified: true,
      hasUnresolvedWarnings,
      allowed: true,
    };
  }

  return {
    saveState: "SAVE_CLEAN",
    isUserVerified: false,
    hasUnresolvedWarnings,
    allowed: true,
  };
}
