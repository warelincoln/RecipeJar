import "dotenv/config";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const migrationPath = resolve(
    import.meta.dirname ?? __dirname,
    "../drizzle/0008_auth_profiles_user_id.sql",
  );
  const migration = readFileSync(migrationPath, "utf8");

  try {
    await sql.unsafe(migration);
    console.log("Phase 1 migration applied successfully");
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      console.log("Phase 1 already applied (idempotent) — continuing");
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
