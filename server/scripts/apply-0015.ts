import "dotenv/config";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * One-off applier for migration 0015_drafts_resolved_url.sql.
 *
 * The project's existing `apply-all-migrations.ts` re-runs every .sql file in
 * the drizzle/ directory and relies on the "already exists" error message to
 * skip already-applied migrations. That works, but on a shared Supabase DB
 * touched by Railway prod it's safer to apply only the one migration we just
 * audited. This script does exactly that — reads 0015's SQL, runs it once,
 * exits.
 *
 * Safety properties of 0015:
 *   - Additive: adds a nullable `resolved_url text` column to drafts.
 *   - Idempotent: uses ADD COLUMN IF NOT EXISTS.
 *   - No backfill, no data transformation, no index changes.
 *   - No RLS implications (existing drafts_* policies are user_id-scoped).
 *   - No view / materialized view / trigger references drafts.* columns.
 *   - Prod code (current deploy) has no resolvedUrl in its Drizzle schema,
 *     so SELECTs + INSERTs from prod ignore the new column entirely.
 *
 * Rollback: ALTER TABLE "drafts" DROP COLUMN IF EXISTS "resolved_url";
 */
async function main() {
  const drizzleDir = resolve(import.meta.dirname ?? __dirname, "../drizzle");
  const file = "0015_drafts_resolved_url.sql";
  const body = readFileSync(resolve(drizzleDir, file), "utf8");

  const dbHost =
    (process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "(unknown)";
  console.log(`Applying ${file} to DATABASE host: ${dbHost}`);

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql.unsafe(body);
    console.log(`✓ applied ${file}`);

    // Verify: re-query to confirm the column exists post-ALTER.
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'drafts'
        AND column_name = 'resolved_url'
    `;
    if (rows.length !== 1) {
      throw new Error("Post-migration verification failed: resolved_url column not found");
    }
    console.log("✓ verified: drafts.resolved_url column exists");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
