/**
 * Migration 0008 — Phase 2: Seed-user backfill
 *
 * Prereqs: Phase 1 SQL (0008_auth_profiles_user_id.sql) must be applied first.
 *
 * What this script does:
 *   1. Snapshot row counts (before)
 *   2. Create a migration seed user via Supabase Admin API
 *   3. Verify the trigger created the matching profiles row
 *   4. Backfill user_id on recipes, collections, drafts, recipe_notes
 *   5. Verify every row has a user_id (no NULLs remain)
 *   6. ALTER columns to NOT NULL
 *   7. Add FK constraints (user_id → profiles.id)
 *   8. Ban the seed user so it cannot authenticate
 *   9. Print summary
 *
 * Usage:  npx tsx server/scripts/migrate-0008-backfill.ts
 * Idempotent: safe to re-run; skips steps that are already done.
 */

import "dotenv/config";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const SEED_EMAIL = "migration-seed@getorzo.com";
const TABLES_TO_BACKFILL = [
  "recipes",
  "collections",
  "drafts",
  "recipe_notes",
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing required env vars: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // ── Step 1: Snapshot row counts ────────────────────────────────
    console.log("\n── Step 1: Row-count snapshot (before) ──");
    const counts: Record<string, number> = {};
    for (const t of TABLES_TO_BACKFILL) {
      const [row] = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
      counts[t] = row.n;
      console.log(`  ${t}: ${row.n} rows`);
    }

    // ── Step 2: Create seed user via Admin API ────────────────────
    console.log("\n── Step 2: Seed user ──");

    const { data: existingUsers } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingSeed = existingUsers?.users?.find(
      (u) => u.email === SEED_EMAIL,
    );

    let seedUserId: string;

    if (existingSeed) {
      seedUserId = existingSeed.id;
      console.log(`  Seed user already exists: ${seedUserId}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: SEED_EMAIL,
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { display_name: "Migration Seed" },
      });
      if (error || !data.user) {
        console.error("  Failed to create seed user:", error);
        process.exit(1);
      }
      seedUserId = data.user.id;
      console.log(`  Created seed user: ${seedUserId}`);
    }

    // ── Step 3: Verify profiles row (trigger should have created it)
    console.log("\n── Step 3: Verify profiles row ──");
    const [profile] = await sql`
      SELECT id FROM profiles WHERE id = ${seedUserId}
    `;
    if (profile) {
      console.log(`  Profile exists for seed user`);
    } else {
      console.log("  Profile missing — inserting manually");
      await sql`
        INSERT INTO profiles (id, display_name)
        VALUES (${seedUserId}, 'Migration Seed')
        ON CONFLICT (id) DO NOTHING
      `;
    }

    // ── Step 4: Backfill user_id ──────────────────────────────────
    console.log("\n── Step 4: Backfill user_id ──");
    for (const t of TABLES_TO_BACKFILL) {
      const [result] = await sql`
        UPDATE ${sql(t)}
        SET user_id = ${seedUserId}
        WHERE user_id IS NULL
      `;
      const affected = (result as any)?.count ?? "0";
      console.log(`  ${t}: ${affected} rows updated`);
    }

    // ── Step 5: Verify no NULLs remain ────────────────────────────
    console.log("\n── Step 5: NULL check ──");
    for (const t of TABLES_TO_BACKFILL) {
      const [row] = await sql`
        SELECT count(*)::int AS n FROM ${sql(t)} WHERE user_id IS NULL
      `;
      if (row.n > 0) {
        console.error(`  ERROR: ${t} still has ${row.n} NULL user_id rows`);
        process.exit(1);
      }
      console.log(`  ${t}: 0 NULLs ✓`);
    }

    // ── Step 6: ALTER columns to NOT NULL ──────────────────────────
    console.log("\n── Step 6: SET NOT NULL ──");
    for (const t of TABLES_TO_BACKFILL) {
      const alreadyNotNull = await sql`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${t}
          AND column_name = 'user_id'
      `;
      if (alreadyNotNull[0]?.is_nullable === "NO") {
        console.log(`  ${t}.user_id already NOT NULL ✓`);
        continue;
      }
      await sql.unsafe(
        `ALTER TABLE "${t}" ALTER COLUMN "user_id" SET NOT NULL`,
      );
      console.log(`  ${t}.user_id → NOT NULL ✓`);
    }

    // ── Step 7: Add FK constraints ────────────────────────────────
    console.log("\n── Step 7: FK constraints ──");
    for (const t of TABLES_TO_BACKFILL) {
      const fkName = `${t}_user_id_profiles_fk`;
      const existing = await sql`
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = ${fkName}
          AND table_schema = 'public'
      `;
      if (existing.length > 0) {
        console.log(`  ${fkName} already exists ✓`);
        continue;
      }
      await sql.unsafe(
        `ALTER TABLE "${t}" ADD CONSTRAINT "${fkName}"
         FOREIGN KEY ("user_id") REFERENCES "profiles"("id")`,
      );
      console.log(`  ${fkName} created ✓`);
    }

    // ── Step 8: Ban the seed user ─────────────────────────────────
    console.log("\n── Step 8: Ban seed user ──");
    const { error: banError } = await supabase.auth.admin.updateUserById(
      seedUserId,
      { ban_duration: "876000h" },
    );
    if (banError) {
      console.warn("  Warning: could not ban seed user:", banError.message);
    } else {
      console.log("  Seed user banned (100 years) ✓");
    }

    // ── Step 9: Summary ───────────────────────────────────────────
    console.log("\n══════════════════════════════════════════");
    console.log("  Migration 0008 backfill COMPLETE");
    console.log(`  Seed user: ${seedUserId} (${SEED_EMAIL})`);
    for (const t of TABLES_TO_BACKFILL) {
      const [row] = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
      console.log(`  ${t}: ${counts[t]} → ${row.n} rows (user_id NOT NULL)`);
    }
    console.log("══════════════════════════════════════════\n");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
