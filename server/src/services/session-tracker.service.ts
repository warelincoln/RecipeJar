import { eq, and, lt } from "drizzle-orm";
import { userSessions } from "../persistence/schema.js";
import { getDb } from "../persistence/db.js";

/**
 * Records or updates a user session based on device info.
 * Deduplicates by userId + deviceInfo to avoid flooding the table.
 */
export async function recordSession(
  userId: string,
  deviceInfo: string | null,
  ipAddress: string | null,
): Promise<void> {
  const db = getDb();

  if (deviceInfo) {
    const [existing] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.deviceInfo, deviceInfo),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(userSessions)
        .set({ lastSeenAt: new Date(), ipAddress })
        .where(eq(userSessions.id, existing.id));
      return;
    }
  }

  await db.insert(userSessions).values({
    userId,
    deviceInfo,
    ipAddress,
  });
}

/**
 * Lists all sessions for a user, ordered by most recently seen.
 */
export async function listSessions(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(userSessions)
    .where(eq(userSessions.userId, userId))
    .orderBy(userSessions.lastSeenAt);
}

/**
 * Deletes sessions older than the given number of days.
 */
export async function cleanupStaleSessions(days: number = 90): Promise<number> {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const result = await db
    .delete(userSessions)
    .where(lt(userSessions.lastSeenAt, cutoff));

  return (result as any)?.rowCount ?? 0;
}
