import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSupabase } from "../services/supabase.js";
import { recordSession } from "../services/session-tracker.service.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

const PUBLIC_ROUTES = new Set(["/health"]);

/**
 * Registers a Fastify onRequest hook that verifies the Supabase access token
 * on every request (except public routes) and sets `request.userId`.
 *
 * Uses Supabase's GoTrue API for token verification — if we later need
 * lower-latency verification, swap to local HS256 check with SUPABASE_JWT_SECRET.
 */
export function registerAuth(app: FastifyInstance) {
  app.decorateRequest("userId", "");

  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const path = request.url.split("?")[0];
      if (PUBLIC_ROUTES.has(path)) return;

      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply
          .status(401)
          .send({ error: "Authentication required" });
      }

      const token = authHeader.slice(7);
      const {
        data: { user },
        error,
      } = await getSupabase().auth.getUser(token);

      if (error || !user) {
        return reply
          .status(401)
          .send({ error: "Invalid or expired token" });
      }

      request.userId = user.id;

      const userAgent = request.headers["user-agent"] ?? null;
      recordSession(user.id, userAgent, request.ip).catch(() => {});
    },
  );
}
