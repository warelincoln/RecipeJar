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

type EventProps = Record<string, string | number | boolean | null>;

export const analytics = {
  track(event: EventName, props?: EventProps): void {
    if (!isEnabled) return;
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
    if (!isEnabled) return;
    try {
      posthog.screen(name, props);
    } catch {}
  },
};
