import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Decodes a JWT payload without cryptographic verification.
 * Safe to use AFTER the auth middleware has already verified the token
 * via `supabase.auth.getUser()`.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Extracts the JWT `iat` (issued at) timestamp from the request's
 * Authorization header. Returns null if the token is missing or malformed.
 */
export function getTokenIssuedAt(request: FastifyRequest): number | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.iat !== "number") return null;

  return payload.iat;
}

/**
 * Returns the Authenticator Assurance Level from the JWT.
 * Supabase JWTs include `aal` claim: "aal1" (password only) or "aal2" (MFA verified).
 */
export function getAuthAssuranceLevel(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.aal !== "string") return null;

  return payload.aal;
}

/**
 * Fastify preHandler that requires the user's session to have been
 * authenticated recently (within `maxAgeSeconds`). Use for sensitive
 * actions like account deletion, email change, and MFA changes.
 *
 * If the session is older than `maxAgeSeconds`, returns 403 with
 * `reauthentication_required` error, signaling the client to call
 * `supabase.auth.reauthenticate()` before retrying.
 */
export function requireRecentAuth(maxAgeSeconds: number = 300) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const iat = getTokenIssuedAt(request);
    if (iat === null) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const now = Math.floor(Date.now() / 1000);
    const age = now - iat;

    if (age > maxAgeSeconds) {
      return reply.status(403).send({
        error: "reauthentication_required",
        message: `This action requires recent authentication (within ${maxAgeSeconds}s). Please re-authenticate and try again.`,
        maxAge: maxAgeSeconds,
        tokenAge: age,
      });
    }
  };
}

/**
 * Fastify preHandler that requires AAL2 (MFA-verified session).
 * Only enforced if the user has MFA enabled — users without MFA
 * are allowed through at AAL1.
 */
export function requireAal2IfEnrolled() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const aal = getAuthAssuranceLevel(request);
    if (aal === "aal2") return;
    if (aal === null) return;

    return reply.status(403).send({
      error: "mfa_verification_required",
      message: "This action requires MFA verification. Please verify your second factor.",
    });
  };
}
