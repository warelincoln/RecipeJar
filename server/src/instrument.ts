// Sentry must be initialized before any other module that needs instrumentation
// is imported. Keep this file small: import it once, at the top of app.ts.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Trace 100% of requests in dev; in prod, downsample to keep costs bounded.
    // Parse latency is the thing we're optimizing, so we need most samples to
    // survive until the per-stage dashboard is tuned. Lower this later.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.5 : 1.0,
    // Off for now. Turn on if we need flamegraphs for CPU-bound work.
    profilesSampleRate: 0,
    // sendDefaultPii would ship IPs and headers to Sentry — off by design.
    // We already scrub PII in log payloads; Sentry events follow the same rule.
    sendDefaultPii: false,
  });
}
