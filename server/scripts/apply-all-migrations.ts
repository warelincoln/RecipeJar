import "dotenv/config";
import postgres from "postgres";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

async function main() {
  const drizzleDir = resolve(import.meta.dirname ?? __dirname, "../drizzle");
  const sqlFiles = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // filename-lexicographic sort; 0000_*.sql → 0012_*.sql are zero-padded

  if (sqlFiles.length === 0) {
    console.error(`No .sql files found in ${drizzleDir}`);
    process.exit(1);
  }

  const dbHost = (process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "(unknown)";
  console.log(`Applying ${sqlFiles.length} migration(s) to DATABASE host: ${dbHost}`);
  console.log("");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  let applied = 0;
  let skipped = 0;

  try {
    for (const file of sqlFiles) {
      const body = readFileSync(resolve(drizzleDir, file), "utf8");
      try {
        await sql.unsafe(body);
        console.log(`✓ applied ${file}`);
        applied++;
      } catch (err: any) {
        const message: string = err?.message ?? String(err);
        if (message.includes("already exists")) {
          console.log(`• ${file} already applied — skipping`);
          skipped++;
        } else {
          throw new Error(`Failed on ${file}: ${message}`);
        }
      }
    }
  } finally {
    await sql.end();
  }

  console.log("");
  console.log(`Done. applied=${applied} skipped=${skipped} total=${sqlFiles.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
