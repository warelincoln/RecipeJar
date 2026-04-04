/**
 * Hard-delete accounts that were soft-deleted 30+ days ago.
 *
 * Deletes all user data:
 *   - Storage objects (recipe-images, recipe-pages) under {userId}/
 *   - Database rows (cascades from profiles delete)
 *   - Supabase auth.users row
 *
 * Run on a schedule (e.g., daily cron):
 *   npx tsx server/scripts/hard-delete-accounts.ts
 */

import "dotenv/config";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const GRACE_PERIOD_DAYS = 30;
const RECIPE_IMAGES_BUCKET = "recipe-images";
const RECIPE_PAGES_BUCKET = "recipe-pages";

async function deleteUserStorage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  for (const bucket of [RECIPE_IMAGES_BUCKET, RECIPE_PAGES_BUCKET]) {
    const allPaths: string[] = [];

    async function collectPaths(prefix: string) {
      const { data: items } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: 1000 });
      if (!items) return;
      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) {
          allPaths.push(fullPath);
        } else {
          await collectPaths(fullPath);
        }
      }
    }

    await collectPaths(userId);

    if (allPaths.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < allPaths.length; i += batchSize) {
        const batch = allPaths.slice(i, i + batchSize);
        await supabase.storage.from(bucket).remove(batch);
      }
      console.log(`  Deleted ${allPaths.length} objects from ${bucket}`);
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing required env vars: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - GRACE_PERIOD_DAYS);

    const deletable = await sql`
      SELECT id FROM profiles
      WHERE deleted_at IS NOT NULL
        AND deleted_at < ${cutoff.toISOString()}
    `;

    if (deletable.length === 0) {
      console.log("No accounts eligible for hard deletion.");
      return;
    }

    console.log(`Found ${deletable.length} account(s) to hard-delete:\n`);

    for (const row of deletable) {
      const userId = row.id as string;
      console.log(`Processing ${userId}...`);

      try {
        await deleteUserStorage(supabase, userId);

        await sql`DELETE FROM profiles WHERE id = ${userId}`;
        console.log(`  DB rows deleted (cascade)`);

        const { error } = await supabase.auth.admin.deleteUser(userId);
        if (error) {
          console.warn(`  Warning: auth.users delete failed: ${error.message}`);
        } else {
          console.log(`  auth.users row deleted`);
        }

        console.log(`  DONE\n`);
      } catch (err) {
        console.error(`  ERROR processing ${userId}:`, err);
      }
    }

    console.log("Hard-delete run complete.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
