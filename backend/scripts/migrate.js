import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, query } from "../common/db.js";
import { waitFor } from "../common/startup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function alreadyApplied(version) {
  const result = await query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
  return result.rowCount > 0;
}

async function runMigration(fileName) {
  const version = fileName.replace(/\.sql$/i, "");
  if (await alreadyApplied(version)) {
    console.log(`skip ${version}`);
    return;
  }

  const sql = await fs.readFile(path.join(migrationsDir, fileName), "utf8");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
    await client.query("COMMIT");
    console.log(`applied ${version}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  await waitFor("postgres", async () => {
    await query("SELECT 1");
  });

  await ensureMigrationsTable();

  const entries = await fs.readdir(migrationsDir);
  const files = entries.filter((name) => name.endsWith(".sql")).sort();

  for (const fileName of files) {
    await runMigration(fileName);
  }

  await db.end();
  console.log("migrations complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
