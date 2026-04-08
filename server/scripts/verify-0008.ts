import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    console.log("══ Migration 0008 Verification ══\n");

    // 1. profiles table exists with correct columns
    console.log("1. profiles table columns:");
    const profileCols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles'
      ORDER BY ordinal_position
    `;
    for (const c of profileCols) {
      console.log(
        `   ${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default ?? "none"}`,
      );
    }

    // 2. profiles FK to auth.users
    console.log("\n2. profiles FK to auth.users:");
    const profileFk = await sql`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'profiles' AND constraint_type = 'FOREIGN KEY'
    `;
    for (const fk of profileFk) console.log(`   ${fk.constraint_name}`);

    // 3. user_id columns on domain tables
    console.log("\n3. user_id columns (NOT NULL + FK):");
    const tables = ["recipes", "collections", "drafts", "recipe_notes"];
    for (const t of tables) {
      const [col] = await sql`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${t} AND column_name = 'user_id'
      `;
      const fks = await sql`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = ${t} AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%user_id%'
      `;
      console.log(
        `   ${t}.user_id | nullable=${col?.is_nullable ?? "MISSING"} | FK=${fks[0]?.constraint_name ?? "NONE"}`,
      );
    }

    // 4. indexes
    console.log("\n4. user_id indexes:");
    const idxs = await sql`
      SELECT tablename, indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname LIKE 'idx_%user_id'
      ORDER BY tablename
    `;
    for (const i of idxs) console.log(`   ${i.indexname} on ${i.tablename}`);

    // 5. trigger
    console.log("\n5. on_auth_user_created trigger:");
    const triggers = await sql`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_name = 'on_auth_user_created'
    `;
    console.log(
      triggers.length > 0
        ? `   ${triggers[0].trigger_name} on ${triggers[0].event_object_table} ✓`
        : "   MISSING ✗",
    );

    // 6. seed user profile
    console.log("\n6. Seed user profile:");
    const seedProfile = await sql`
      SELECT p.id, p.display_name, p.subscription_tier
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE u.email = 'migration-seed@getorzo.com'
    `;
    if (seedProfile.length > 0) {
      console.log(
        `   id=${seedProfile[0].id} | name=${seedProfile[0].display_name} | tier=${seedProfile[0].subscription_tier} ✓`,
      );
    } else {
      console.log("   MISSING ✗");
    }

    // 7. row counts with user_id populated
    console.log("\n7. Row counts (all with user_id):");
    for (const t of tables) {
      const [total] = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
      const [withUid] = await sql`
        SELECT count(*)::int AS n FROM ${sql(t)} WHERE user_id IS NOT NULL
      `;
      const status = total.n === withUid.n ? "✓" : "✗ MISMATCH";
      console.log(`   ${t}: ${total.n} total, ${withUid.n} with user_id ${status}`);
    }

    console.log("\n══ Verification complete ══");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
