import * as Sentry from "@sentry/react-native";

const SENTRY_DSN =
  "https://b9e093e0c15c4a88564e11aff3ac9a6a@o4511233211432960.ingest.us.sentry.io/4511233213464576";

export function initSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? "development" : "production",
    enabled: !__DEV__,
    debug: false,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    attachStacktrace: true,
    enableAutoSessionTracking: true,
  });
}

export { Sentry };
