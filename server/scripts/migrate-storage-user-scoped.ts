/**
 * WS-6 Storage Migration: Flat paths → User-scoped paths
 *
 * Moves all storage objects to user-scoped paths and updates DB references.
 *
 * Recipe images:  {recipeId}/hero.jpg  →  {userId}/recipes/{recipeId}/hero.jpg
 *                 {recipeId}/thumb.jpg →  {userId}/recipes/{recipeId}/thumb.jpg
 * Draft pages:    {draftId}/{file}.jpg →  {userId}/drafts/{draftId}/{file}.jpg
 *
 * DB columns updated:
 *   - recipes.image_url
 *   - draft_pages.image_uri
 *   - recipe_source_pages.image_uri
 *
 * Prerequisites:
 *   - 0008 backfill complete (user_id NOT NULL on recipes, drafts)
 *   - Server code deployed with user-scoped path logic
 *
 * Safe to re-run: skips objects already at their target path.
 *
 * Usage:  npx tsx server/scripts/migrate-storage-user-scoped.ts
 */

import "dotenv/config";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const RECIPE_IMAGES_BUCKET = "recipe-images";
const RECIPE_PAGES_BUCKET = "recipe-pages";

interface MigrationResult {
  moved: number;
  skipped: number;
  errors: number;
}

async function moveStorageObject(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  oldPath: string,
  newPath: string,
): Promise<boolean> {
  if (oldPath === newPath) return true;

  const { data, error: downloadErr } = await supabase.storage
    .from(bucket)
    .download(oldPath);
  if (downloadErr || !data) {
    console.warn(`  ⚠ Could not download ${bucket}/${oldPath}: ${downloadErr?.message ?? "no data"}`);
    return false;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(newPath, buffer, { upsert: true, contentType: "image/jpeg" });
  if (uploadErr) {
    console.warn(`  ⚠ Could not upload ${bucket}/${newPath}: ${uploadErr.message}`);
    return false;
  }

  const { error: removeErr } = await supabase.storage
    .from(bucket)
    .remove([oldPath]);
  if (removeErr) {
    console.warn(`  ⚠ Uploaded but could not remove old ${bucket}/${oldPath}: ${removeErr.message}`);
  }

  return true;
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
    // ── Step 1: Migrate recipe images ──────────────────────────────
    console.log("\n── Step 1: Migrate recipe images ──");
    const recipes = await sql`
      SELECT id, user_id, image_url FROM recipes WHERE image_url IS NOT NULL
    `;
    console.log(`  Found ${recipes.length} recipes with images`);

    const recipeResult: MigrationResult = { moved: 0, skipped: 0, errors: 0 };
    for (const recipe of recipes) {
      const oldPath = recipe.image_url as string;
      const isAlreadyScoped = oldPath.startsWith(`${recipe.user_id}/`);
      if (isAlreadyScoped) {
        recipeResult.skipped++;
        continue;
      }

      const recipeId = oldPath.split("/")[0];
      const newHeroPath = `${recipe.user_id}/recipes/${recipeId}/hero.jpg`;
      const newThumbPath = `${recipe.user_id}/recipes/${recipeId}/thumb.jpg`;
      const oldHeroPath = `${recipeId}/hero.jpg`;
      const oldThumbPath = `${recipeId}/thumb.jpg`;

      const heroOk = await moveStorageObject(supabase, RECIPE_IMAGES_BUCKET, oldHeroPath, newHeroPath);
      const thumbOk = await moveStorageObject(supabase, RECIPE_IMAGES_BUCKET, oldThumbPath, newThumbPath);

      if (heroOk) {
        await sql`UPDATE recipes SET image_url = ${newHeroPath} WHERE id = ${recipe.id}`;
        recipeResult.moved++;
        console.log(`  ✓ ${recipe.id}: ${oldHeroPath} → ${newHeroPath}`);
      } else {
        recipeResult.errors++;
        console.error(`  ✗ ${recipe.id}: failed to move hero image`);
      }

      if (!thumbOk) {
        console.warn(`  ⚠ ${recipe.id}: thumb migration failed (non-critical)`);
      }
    }
    console.log(`  Recipe images: ${recipeResult.moved} moved, ${recipeResult.skipped} skipped, ${recipeResult.errors} errors`);

    // ── Step 2: Migrate draft page images ──────────────────────────
    console.log("\n── Step 2: Migrate draft page images ──");
    const draftPages = await sql`
      SELECT dp.id, dp.image_uri, d.user_id, d.id AS draft_id
      FROM draft_pages dp
      JOIN drafts d ON d.id = dp.draft_id
      WHERE dp.image_uri IS NOT NULL
    `;
    console.log(`  Found ${draftPages.length} draft pages with images`);

    const pageResult: MigrationResult = { moved: 0, skipped: 0, errors: 0 };
    for (const page of draftPages) {
      const oldPath = page.image_uri as string;
      const isAlreadyScoped = oldPath.startsWith(`${page.user_id}/`);
      if (isAlreadyScoped) {
        pageResult.skipped++;
        continue;
      }

      const fileName = oldPath.split("/").pop()!;
      const newPath = `${page.user_id}/drafts/${page.draft_id}/${fileName}`;

      const ok = await moveStorageObject(supabase, RECIPE_PAGES_BUCKET, oldPath, newPath);
      if (ok) {
        await sql`UPDATE draft_pages SET image_uri = ${newPath} WHERE id = ${page.id}`;
        pageResult.moved++;
        console.log(`  ✓ ${page.id}: ${oldPath} → ${newPath}`);
      } else {
        pageResult.errors++;
        console.error(`  ✗ ${page.id}: failed to move`);
      }
    }
    console.log(`  Draft pages: ${pageResult.moved} moved, ${pageResult.skipped} skipped, ${pageResult.errors} errors`);

    // ── Step 3: Migrate recipe source page images ──────────────────
    console.log("\n── Step 3: Migrate recipe source page images ──");
    const sourcePages = await sql`
      SELECT rsp.id, rsp.image_uri, r.user_id, r.id AS recipe_id
      FROM recipe_source_pages rsp
      JOIN recipes r ON r.id = rsp.recipe_id
      WHERE rsp.image_uri IS NOT NULL
    `;
    console.log(`  Found ${sourcePages.length} source pages with images`);

    const spResult: MigrationResult = { moved: 0, skipped: 0, errors: 0 };
    for (const sp of sourcePages) {
      const oldPath = sp.image_uri as string;
      const isAlreadyScoped = oldPath.startsWith(`${sp.user_id}/`);
      if (isAlreadyScoped) {
        spResult.skipped++;
        continue;
      }

      const fileName = oldPath.split("/").pop()!;
      const draftId = oldPath.split("/")[0];
      const newPath = `${sp.user_id}/drafts/${draftId}/${fileName}`;

      await sql`UPDATE recipe_source_pages SET image_uri = ${newPath} WHERE id = ${sp.id}`;
      spResult.moved++;
    }
    console.log(`  Source pages: ${spResult.moved} updated, ${spResult.skipped} skipped, ${spResult.errors} errors`);

    // ── Summary ────────────────────────────────────────────────────
    const totalErrors = recipeResult.errors + pageResult.errors + spResult.errors;
    console.log("\n══════════════════════════════════════════");
    console.log("  Storage migration COMPLETE");
    console.log(`  Recipe images: ${recipeResult.moved} moved`);
    console.log(`  Draft pages:   ${pageResult.moved} moved`);
    console.log(`  Source pages:  ${spResult.moved} updated`);
    if (totalErrors > 0) {
      console.log(`  ⚠ ${totalErrors} total errors — review output above`);
    }
    console.log("══════════════════════════════════════════\n");

    if (totalErrors > 0) process.exit(1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
