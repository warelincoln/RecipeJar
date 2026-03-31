export type EventType =
  | "draft_created"
  | "page_added"
  | "pages_reordered"
  | "parse_started"
  | "parse_rejected_idempotent"
  | "url_parse_capture_failed"
  | "url_parse_source_selected"
  | "parse_completed"
  | "parse_failed"
  | "validation_completed"
  | "retake_requested"
  | "retake_submitted"
  | "correction_mode_entered"
  | "warning_dismissed"
  | "draft_cancelled"
  | "recipe_saved"
  | "startup_stuck_drafts_reset"
  | "startup_cancelled_drafts_cleaned";

export interface EventAttributes {
  draftId?: string;
  recipeId?: string;
  sourceType?: string;
  pageCount?: number;
  issueCountBlock?: number;
  issueCountCorrectionRequired?: number;
  issueCountFlag?: number;
  issueCountRetake?: number;
  saveState?: string;
  warningsDismissed?: boolean;
  retakeCount?: number;
  pageId?: string;
  issueId?: string;
  [key: string]: unknown;
}

export function logEvent(event: EventType, attributes: EventAttributes = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...attributes,
  };

  // Structured JSON logging for observability pipelines
  console.log(JSON.stringify(entry));
}
