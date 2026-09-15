import "dotenv/config";
import { Client } from "pg";

/**
 * Creates the database named in DATABASE_URL if it does not exist yet.
 * Postgres has no `CREATE DATABASE IF NOT EXISTS`, so the existence check is done first.
 * The maintenance connection uses the same host/credentials but the default `postgres` db.
 */
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("✗ DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const target = new URL(raw);
const dbName = target.pathname.replace(/^\//, "");
if (!dbName) {
  console.error(`✗ DATABASE_URL has no database name in it: ${raw}`);
  process.exit(1);
}

const maintenance = new Client({
  host: target.hostname,
  port: Number(target.port || 5432),
  user: decodeURIComponent(target.username),
  password: decodeURIComponent(target.password),
  database: "postgres",
  ssl: target.searchParams.get("sslmode") === "require" ? { rejectUnauthorized: false } : false,
});

try {
  await maintenance.connect();
} catch (err) {
  console.error(`✗ Cannot reach PostgreSQL at ${target.hostname || "127.0.0.1"}:${target.port || 5432}: ${err.message}`);
  console.error("  Start it with `docker compose up -d` (then use the 5433 DATABASE_URL from .env.example),");
  console.error("  or point DATABASE_URL at a PostgreSQL that is already running.");
  process.exit(1);
}

const existing = await maintenance.query("select 1 from pg_database where datname = $1", [dbName]);
if (existing.rowCount > 0) {
  console.log(`✓ Database "${dbName}" already exists.`);
} else {
  await maintenance.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
  console.log(`✓ Created database "${dbName}".`);
}
await maintenance.end();
