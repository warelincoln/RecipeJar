import type { ParsedRecipeCandidate, ValidationIssue } from "@orzo/shared";

/**
 * Rules keyed on `candidate.extractionError`. Today only `url_bot_blocked`
 * produces a validation issue here — `steps_failed` is handled by
 * `rules.steps.ts` via STEPS_EXTRACTION_FAILED, and `ingredients_failed`
 * is reserved for future use. The client message override in
 * `issueDisplayMessage.ts` is the user-facing copy; the server string is
 * kept terse so copy changes do not require re-parsing persisted drafts.
 */
export function evaluateExtractionError(
  candidate: ParsedRecipeCandidate,
): ValidationIssue[] {
  if (candidate.extractionError === "url_bot_blocked") {
    return [
      {
        issueId: "url-bot-blocked",
        code: "URL_BOT_BLOCKED",
        severity: "BLOCK",
        message: "URL blocked by bot detection.",
        userDismissible: false,
        userResolvable: false,
      },
    ];
  }

  return [];
}
