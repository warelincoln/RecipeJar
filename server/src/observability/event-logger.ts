export type EventType =
  | "draft_created"
  | "page_added"
  | "pages_reordered"
  | "parse_started"
  | "parse_completed"
  | "validation_completed"
  | "retake_requested"
  | "retake_submitted"
  | "correction_mode_entered"
  | "warning_dismissed"
  | "recipe_saved";

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
