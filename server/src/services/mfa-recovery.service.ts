import { randomBytes, createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { mfaRecoveryCodes } from "../persistence/schema.js";
import { getDb } from "../persistence/db.js";

const RECOVERY_CODE_COUNT = 10;
const CODE_LENGTH = 8;

function generateCode(): string {
  return randomBytes(CODE_LENGTH)
    .toString("hex")
    .slice(0, CODE_LENGTH)
    .toUpperCase();
}

function hashCode(code: string): string {
  return createHash("sha256")
    .update(code.toUpperCase().replace(/-/g, ""))
    .digest("hex");
}

function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Generates recovery codes for a user, replacing any existing codes.
 * Returns the plaintext codes (display once to user, never stored).
 */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  const db = getDb();

  await db
    .delete(mfaRecoveryCodes)
    .where(eq(mfaRecoveryCodes.userId, userId));

  const plaintextCodes: string[] = [];
  const rows = [];

  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generateCode();
    plaintextCodes.push(formatCode(code));
    rows.push({
      userId,
      codeHash: hashCode(code),
    });
  }

  await db.insert(mfaRecoveryCodes).values(rows);

  return plaintextCodes;
}

/**
 * Verifies a recovery code for a user. If valid, marks it as used
 * and returns true. Returns false if the code is invalid or already used.
 */
export async function verifyRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const db = getDb();
  const normalized = code.toUpperCase().replace(/-/g, "");
  const hash = hashCode(normalized);

  const [match] = await db
    .select()
    .from(mfaRecoveryCodes)
    .where(
      and(
        eq(mfaRecoveryCodes.userId, userId),
        eq(mfaRecoveryCodes.codeHash, hash),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    )
    .limit(1);

  if (!match) return false;

  await db
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(eq(mfaRecoveryCodes.id, match.id));

  return true;
}

/**
 * Returns the count of remaining (unused) recovery codes for a user.
 */
export async function getRemainingCodeCount(userId: string): Promise<number> {
  const db = getDb();
  const codes = await db
    .select()
    .from(mfaRecoveryCodes)
    .where(
      and(
        eq(mfaRecoveryCodes.userId, userId),
        isNull(mfaRecoveryCodes.usedAt),
      ),
    );
  return codes.length;
}
