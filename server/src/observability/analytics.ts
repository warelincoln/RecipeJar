import { PostHog } from "posthog-node";

export type AnalyticsEventName =
  | "server_parse_completed"
  | "server_parse_validated"
  | "server_parse_failed"
  | "server_url_capture_failed"
  | "server_recipe_saved"
  | "server_hero_image_missing"
  // Per-call token + cost breakdown from the image parse adapter. Emitted
  // once per OpenAI call that settled successfully. See
  // server/src/parsing/image/pricing.ts for the rate table.
  | "server_parse_tokens"
  // Per-recipe aggregate across whichever calls settled. Used to track
  // real p50/p90 cost per parse so we can compare against the eval-study
  // candidates (plan: ~/.claude/plans/snug-waddling-quiche.md).
  | "server_parse_cost";

type Primitive = string | number | boolean | null | undefined;
type AnalyticsProps = Record<string, Primitive | Primitive[]>;

const apiKey = process.env.POSTHOG_API_KEY_SERVER;
const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
const firehoseEnabled = process.env.ANALYTICS_FIREHOSE_ENABLED !== "false";
const isProd = process.env.NODE_ENV === "production";

let client: PostHog | null = null;

if (apiKey && isProd && firehoseEnabled) {
  client = new PostHog(apiKey, {
    host,
    flushAt: 20,
    flushInterval: 10000,
  });
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "analytics_initialized",
      host,
    }),
  );
} else {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "analytics_disabled",
      reason: !apiKey
        ? "missing_api_key"
        : !isProd
          ? "non_production"
          : "firehose_disabled",
    }),
  );
}

export function trackAnalytics(
  event: AnalyticsEventName,
  props: AnalyticsProps,
  opts: { userId?: string | null } = {},
): void {
  if (!client) return;
  try {
    client.capture({
      distinctId: opts.userId ?? "anonymous",
      event,
      properties: sanitizeProps(props),
    });
  } catch {}
}

export async function shutdownAnalytics(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch {}
}

function sanitizeProps(props: AnalyticsProps): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (typeof value === "string" && value.length > 500) {
      out[key] = value.slice(0, 500);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
