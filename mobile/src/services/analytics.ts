import PostHog from "posthog-react-native";

const POSTHOG_API_KEY = "phc_CtV84PRqskvxT2HAfHCDQheiZzgd3niCFxNoU82FVPjA";
const POSTHOG_HOST = "https://us.i.posthog.com";

const isEnabled = !__DEV__;

const posthog = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
  disabled: !isEnabled,
});

type EventName =
  | "import_started"
  | "import_url_entered"
  | "import_parsed"
  | "import_blocked_shown"
  | "import_retake_required"
  | "import_retake_initiated"
  | "import_dismissed"
  | "import_save_attempted"
  | "import_saved"
  | "import_save_failed"
  | "import_timed_out"
  | "import_completed"
  | "import_failed"
  | "recipe_saved"
  | "recipe_viewed"
  | "collection_created"
  | "recipe_assigned_to_collection"
  | "recipe_bulk_deleted"
  | "recipe_bulk_moved"
  | "times_banner_shown"
  | "times_accepted"
  | "times_edited";

type EventValue = string | number | boolean | null | string[];
type EventProps = Record<string, EventValue>;

/**
 * Kill switch. When the PostHog boolean flag `analytics_firehose_enabled` is
 * set to `false` in the PostHog dashboard, client events stop firing within
 * seconds of the next flag poll. Any other value (including missing /
 * undefined, i.e. pre-fetch) defaults to emitting so we don't lose events on
 * cold start.
 */
function firehoseEnabled(): boolean {
  if (!isEnabled) return false;
  try {
    const flag = posthog.getFeatureFlag("analytics_firehose_enabled");
    return flag !== false;
  } catch {
    return true;
  }
}

export const analytics = {
  track(event: EventName, props?: EventProps): void {
    if (!firehoseEnabled()) return;
    try {
      posthog.capture(event, props);
    } catch {}
  },
  identify(userId: string, traits?: EventProps): void {
    if (!isEnabled) return;
    try {
      posthog.identify(userId, traits);
    } catch {}
  },
  reset(): void {
    if (!isEnabled) return;
    try {
      posthog.reset();
    } catch {}
  },
  screen(name: string, props?: EventProps): void {
    if (!firehoseEnabled()) return;
    try {
      posthog.screen(name, props);
    } catch {}
  },
};
