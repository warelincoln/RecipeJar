import "dotenv/config";
// Must come before any instrumented import. Sentry.init needs to run before
// Fastify/HTTP are required so its auto-instrumentation can hook them.
import "./instrument.js";
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { URL_IMPORT_HTML_MAX_BYTES } from "@orzo/shared";
import { registerAuth } from "./middleware/auth.js";
import { draftsRoutes } from "./api/drafts.routes.js";
import { recipesRoutes } from "./api/recipes.routes.js";
import { collectionsRoutes } from "./api/collections.routes.js";
import { accountRoutes } from "./api/account.routes.js";
import { draftsRepository } from "./persistence/drafts.repository.js";
import { logEvent } from "./observability/event-logger.js";
import { shutdownAnalytics } from "./observability/analytics.js";

const app = Fastify({
  logger: {
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname,
          remoteAddress: request.ip,
        };
      },
    },
  },
  bodyLimit: URL_IMPORT_HTML_MAX_BYTES + 64 * 1024,
});

app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    const text = (body as string).trim();
    if (!text) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

// Wire Sentry's Fastify error handler so unhandled errors get captured with
// request context. No-op when SENTRY_DSN is unset.
Sentry.setupFastifyErrorHandler(app);

registerAuth(app);

app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (request) => request.userId || request.ip,
  allowList: (request) => request.url.split("?")[0] === "/health",
  onExceeded: (request) => {
    logEvent("rate_limit_exceeded", { userId: request.userId });
  },
});

app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
app.register(draftsRoutes);
app.register(recipesRoutes);
app.register(collectionsRoutes);
app.register(accountRoutes);

app.get("/health", async () => ({ status: "ok" }));

const port = parseInt(process.env.PORT ?? "3000", 10);

app.listen({ port, host: "0.0.0.0" }, async (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening on ${address}`);

  try {
    const stuckCount = await draftsRepository.resetStuckParsingDrafts();
    if (stuckCount > 0) {
      logEvent("startup_stuck_drafts_reset", { count: stuckCount });
    }

    const cleanedCount = await draftsRepository.deleteOldCancelledDrafts();
    if (cleanedCount > 0) {
      logEvent("startup_cancelled_drafts_cleaned", { count: cleanedCount });
    }
  } catch (startupErr) {
    app.log.warn({ err: startupErr }, "Startup draft cleanup failed (non-fatal)");
  }
});

async function gracefulShutdown(signal: NodeJS.Signals) {
  app.log.info(`${signal} received — flushing analytics and closing server`);
  try {
    await shutdownAnalytics();
  } catch (err) {
    app.log.warn({ err }, "Analytics shutdown failed (non-fatal)");
  }
  try {
    await app.close();
  } catch (err) {
    app.log.warn({ err }, "Fastify close failed");
  }
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

export default app;
