import type { FastifyInstance } from "fastify";
import { getSupabase } from "../services/supabase.js";
import { logEvent } from "../observability/event-logger.js";
import { requireRecentAuth } from "../middleware/step-up-auth.js";
import {
  generateRecoveryCodes,
  verifyRecoveryCode,
  getRemainingCodeCount,
} from "../services/mfa-recovery.service.js";
import { listSessions } from "../services/session-tracker.service.js";

export async function accountRoutes(app: FastifyInstance) {
  app.delete("/account", async (request, reply) => {
    const userId = request.userId;

    const { error: deleteAuthError } = await getSupabase().auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      request.log.error({ err: deleteAuthError, userId }, "Failed to delete auth user during account deletion");
      return reply.status(500).send({ error: "Failed to delete account. Please try again." });
    }

    logEvent("account_deletion_requested", { userId });

    return reply.send({ success: true, message: "Account deleted" });
  });

  app.post("/account/recovery-codes", {
    preHandler: [requireRecentAuth(300)],
  }, async (request, reply) => {
    const codes = await generateRecoveryCodes(request.userId);
    return reply.send({ codes });
  });

  app.post("/account/verify-recovery-code", async (request, reply) => {
    const { code } = request.body as { code: string };
    if (!code || typeof code !== "string") {
      return reply.status(400).send({ error: "Recovery code is required" });
    }

    const valid = await verifyRecoveryCode(request.userId, code);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid or already used recovery code" });
    }

    return reply.send({ success: true });
  });

  app.get("/account/recovery-codes/remaining", async (request, reply) => {
    const count = await getRemainingCodeCount(request.userId);
    return reply.send({ remaining: count });
  });

  app.get("/account/sessions", async (request, reply) => {
    const sessions = await listSessions(request.userId);
    return reply.send({
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceInfo: s.deviceInfo,
        ipAddress: s.ipAddress,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
      })),
    });
  });
}
