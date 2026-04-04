import "dotenv/config";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const migrationPath = resolve(
    import.meta.dirname ?? __dirname,
    "../drizzle/0009_rls_policies.sql",
  );
  const migration = readFileSync(migrationPath, "utf8");

  try {
    await sql.unsafe(migration);
    console.log("Migration 0009 (RLS policies) applied successfully");
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      console.log("Migration 0009 already applied (idempotent) — continuing");
    } else {
      throw err;
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
