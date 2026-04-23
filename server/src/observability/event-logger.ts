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
  | "startup_cancelled_drafts_cleaned"
  | "account_deletion_requested"
  | "auth_middleware_failure"
  | "rate_limit_exceeded"
  // Per-call token/cost breakdown from the image-parse adapter. Mirrors
  // the `server_parse_tokens` PostHog event so grep-server-logs triage
  // can see the same data without the analytics roundtrip.
  | "parse_tokens"
  // Hero image attach outcome on URL-sourced recipes: logs the metadata
  // URL we extracted and whether the remote fetch + Supabase upload
  // succeeded. Complements the `server_hero_image_missing` PostHog event
  // with the raw URL so we can diagnose per-domain download failures.
  | "hero_image_attach"
  // Webview-captured HTML failed to parse; we're falling back to a fresh
  // server-side fetch. Observed when an in-app WebKit capture returns a
  // skeletal DOM (missing recipe body) even though the server can fetch
  // the full page.
  | "webview_html_retry_via_server_fetch";

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
