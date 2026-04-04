import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    console.log("══ Migration 0009 RLS Verification ══\n");

    // 1. Check RLS enabled on all tables
    console.log("1. RLS status per table:");
    const tables = await sql`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'profiles', 'recipes', 'collections', 'drafts', 'recipe_notes',
          'draft_pages', 'draft_warning_states', 'recipe_collections',
          'recipe_ingredients', 'recipe_steps', 'recipe_source_pages'
        )
      ORDER BY tablename
    `;
    let allEnabled = true;
    for (const t of tables) {
      const status = t.rowsecurity ? "ENABLED ✓" : "DISABLED ✗";
      if (!t.rowsecurity) allEnabled = false;
      console.log(`   ${t.tablename}: ${status}`);
    }

    // 2. Count policies per table
    console.log("\n2. Policy count per table:");
    const policies = await sql`
      SELECT tablename, count(*)::int AS policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
      GROUP BY tablename
      ORDER BY tablename
    `;
    for (const p of policies) {
      console.log(`   ${p.tablename}: ${p.policy_count} policies`);
    }

    // 3. List all policies
    console.log("\n3. All policies:");
    const allPolicies = await sql`
      SELECT tablename, policyname, permissive, roles, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, cmd
    `;
    for (const p of allPolicies) {
      console.log(
        `   ${p.tablename} | ${p.policyname} | ${p.cmd} | roles=${p.roles}`,
      );
    }

    console.log(
      `\n══ Verification ${allEnabled ? "PASSED ✓" : "FAILED ✗"} ══`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
