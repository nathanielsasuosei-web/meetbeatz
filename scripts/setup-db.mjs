#!/usr/bin/env node
/**
 * Meetbeatz database setup / doctor.
 *
 *   npm run db:setup
 *
 * 1. Reads DATABASE_URL from .env
 * 2. Checks that PostgreSQL answers on that host/port with those credentials
 * 3. If nothing answers, tries to start it with `docker compose up -d`
 * 4. Creates / updates every table from src/db/schema.ts (drizzle-kit push)
 * 5. Prints what is in the database so you can start the app with npm run dev
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";
const OK = "✓";
const BAD = "✗";

// ---------------------------------------------------------------------------
// Load .env without requiring dotenv to be installed globally
// ---------------------------------------------------------------------------
function loadEnv() {
  const file = path.join(root, ".env");
  if (!existsSync(file)) {
    console.error(`${BAD} No .env file found in ${root}`);
    console.error("   Copy the template first:");
    console.error(isWindows ? "   copy .env.example .env" : "   cp .env.example .env");
    process.exit(1);
  }
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      user: decodeURIComponent(parsed.username || "postgres"),
      password: decodeURIComponent(parsed.password || ""),
      database: (parsed.pathname || "/").replace(/^\//, "") || "postgres",
    };
  } catch {
    return null;
  }
}

function explain(error, target) {
  const code = error?.code ?? "";
  console.error(`\n${BAD} Could not connect to PostgreSQL at ${target.host}:${target.port}`);
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
    console.error("   Nothing is listening on that port — the database server is not running.");
    console.error("   Fix it with one of these:");
    console.error("     npm run db:up                       # start the bundled Docker database");
    console.error("     (Windows) Start-Service postgresql-x64-18   # start a local install");
    console.error("     (macOS)   brew services start postgresql@16");
  } else if (code === "28P01") {
    console.error(`   Password authentication failed for user "${target.user}".`);
    console.error("   The password in DATABASE_URL does not match the server.");
    console.error("   Reset it in psql:");
    console.error(`     ALTER USER ${target.user} WITH PASSWORD '<the password in .env>';`);
  } else if (code === "3D000") {
    console.error(`   The database "${target.database}" does not exist. Create it with:`);
    console.error(`     createdb -h ${target.host} -p ${target.port} -U ${target.user} ${target.database}`);
  } else if (code === "28000") {
    console.error("   The server rejected your user name / authentication method.");
  } else {
    console.error(`   ${error?.message ?? error}`);
  }
  process.exit(1);
}

async function tryConnect(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await client.connect();
  return client;
}

function run(command, args, label) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\n${BAD} ${label} failed (exit code ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

async function dockerIsAvailable() {
  const probe = spawnSync("docker", ["info"], { stdio: "ignore", shell: isWindows });
  return probe.status === 0;
}

async function waitForDatabase(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const client = await tryConnect(url);
      await client.end();
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return false;
}

async function main() {
  loadEnv();

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(`${BAD} DATABASE_URL is missing from .env`);
    console.error("   Add a line like:");
    console.error("   DATABASE_URL=postgresql://postgres:natthesisa@127.0.0.1:5432/app_db");
    process.exit(1);
  }

  const target = describeTarget(url);
  if (!target) {
    console.error(`${BAD} DATABASE_URL is not a valid connection string: ${url}`);
    process.exit(1);
  }

  console.log("Meetbeatz database setup");
  console.log(`  .env            ${path.join(root, ".env")}`);
  console.log(`  target          ${target.user}@${target.host}:${target.port}/${target.database}`);

  let client = null;
  try {
    client = await tryConnect(url);
    console.log(`${OK} PostgreSQL is reachable`);
  } catch (error) {
    console.log(`… PostgreSQL is not reachable (${error.code ?? "error"})`);
    if (await dockerIsAvailable()) {
      console.log("  Starting it with Docker…");
      run("docker", ["compose", "up", "-d"], "docker compose up");
      if (!(await waitForDatabase(url, 90))) {
        spawnSync("docker", ["compose", "logs", "--tail=20", "db"], { cwd: root, stdio: "inherit" });
        explain(error, target);
      }
      client = await tryConnect(url);
      console.log(`${OK} PostgreSQL is reachable`);
    } else {
      explain(error, target);
    }
  }

  // Which tables exist before we push?
  const before = await listTables(client);

  // Create / update every table declared in src/db/schema.ts
  run("npx", ["drizzle-kit", "push"], "drizzle-kit push");

  const after = await listTables(client);
  console.log(`\n${OK} Schema is in sync — ${after.length} tables: ${after.join(", ")}`);
  if (before.length !== after.length) {
    console.log(`  (${after.length - before.length} created by this run)`);
  }

  const { rows: counts } = await client.query(`
    select 'beats' as table_name, count(*)::int as rows from beats
    union all select 'license_types', count(*)::int from license_types
    union all select 'services', count(*)::int from services
    union all select 'studio_hours', count(*)::int from studio_hours
    union all select 'admins', count(*)::int from admins
    order by 1
  `);
  console.log("\nCurrent rows:");
  for (const row of counts) console.log(`  ${row.table_name.padEnd(15)} ${row.rows}`);

  const empty = counts.filter((r) => r.rows === 0).map((r) => r.table_name);
  if (empty.length) {
    console.log(
      `\nℹ  ${empty.join(", ")} ${empty.length === 1 ? "is" : "are"} still empty — the app seeds` +
        " demo beats, license types, studio services and the admin account on first page load.",
    );
  }

  await client.end();
  console.log("\nNext: npm run dev   →  http://localhost:3000  (admin: /admin/login)");
}

async function listTables(client) {
  try {
    const { rows } = await client.query(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    return rows.map((row) => row.tablename);
  } catch {
    return [];
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
