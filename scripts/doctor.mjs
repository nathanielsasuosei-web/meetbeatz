import "dotenv/config";
import fs from "node:fs";
import net from "node:net";
import { Client } from "pg";

/**
 * Diagnoses a blank / "This page could not be found"-style broken preview in one run:
 * node version, env file, database reachability, schema and seed data.
 * Every route except `/` reads from PostgreSQL, so a missing database turns the whole
 * site into a 500 — this tells you that directly instead of via a stack trace.
 */
const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg, hint) => {
  console.log(`  ✗ ${msg}`);
  if (hint) console.log(`    → ${hint}`);
  problems.push(msg);
};

console.log("\nMeetbeatz preview doctor\n");

console.log("Runtime");
const [major] = process.versions.node.split(".").map(Number);
if (major >= 18) ok(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node}`, "Node 18+ is required (22 recommended).");

if (fs.existsSync("node_modules/next/package.json")) ok("next is installed");
else fail("dependencies are not installed", "Run `npm install`.");

console.log("\nEnvironment");
if (fs.existsSync(".env")) ok(".env found");
else fail(".env is missing", "Run `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`) and fill it in.");

// Same priority order the app uses (src/lib/database-url.ts). A doctor that checked only
// DATABASE_URL would report "not set" for a working Vercel deployment, where the attached
// database is exposed as POSTGRES_URL.
const SOURCES = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "PRISMA_SCHEMA_URL", "SUPABASE_DATABASE_URL"];
let sourceName = null;
let raw = null;
for (const name of SOURCES) {
  const value = String(process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
  if (value) {
    sourceName = name;
    raw = value;
    break;
  }
}

if (!raw) {
  fail("no database connection string set", `Set one of ${SOURCES.join(", ")} — see .env.example.`);
} else {
  console.log(`  ✓ using ${sourceName}`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    // Deliberately never echo the value: it contains the password.
    fail(`${sourceName} is not a valid connection string`, "Expected postgresql://user:password@host:port/db");
  }
  if (url) {
    const host = url.hostname || "127.0.0.1";
    const port = Number(url.port || 5432);
    const dbName = url.pathname.replace(/^\//, "");
    console.log(`\nDatabase (${host}:${port}/${dbName})`);

    const reachable = await new Promise((resolve) => {
      const socket = net
        .connect({ host, port })
        .setTimeout(3000)
        .on("connect", () => {
          socket.destroy();
          resolve(true);
        })
        .on("error", () => resolve(false))
        .on("timeout", () => {
          socket.destroy();
          resolve(false);
        });
    });

    if (!reachable) {
      const composePort = raw.includes(":5433") ? "5433" : "5432";
      fail(
        `nothing is accepting TCP connections on ${host}:${port}`,
        port === 5433
          ? "Run `docker compose up -d` to start the development database."
          : `Start a local PostgreSQL, or run \`docker compose up -d\` and switch DATABASE_URL to port 5433 (see .env.example). If a server is listening on ${composePort} instead, that is the port to use.`,
      );
    } else {
      ok(`port ${port} is open`);
      const client = new Client({ connectionString: raw });
      try {
        await client.connect();
        ok(`authenticated as ${url.username} and connected to "${dbName}"`);

        const tables = await client.query(
          "select table_name from information_schema.tables where table_schema = 'public'",
        );
        if (tables.rowCount === 0) {
          fail("the database is empty (no tables)", "Create the schema with `npx drizzle-kit push`.");
        } else {
          ok(`${tables.rowCount} table(s) in the public schema`);
          const beatRows = tables.rows.some((r) => r.table_name === "beats");
          if (beatRows) {
            const { rows } = await client.query("select count(*)::int as n from beats");
            ok(`beats table has ${rows[0].n} row(s)${rows[0].n === 0 ? " — demo data is seeded on first page load" : ""}`);
          }
          // Beat files (covers, previews, masters, stems) are stored in these
          // tables, so a database without them accepts logins but rejects every
          // upload with "relation stored_files does not exist".
          const hasFiles = tables.rows.some((r) => r.table_name === "stored_files");
          const hasChunks = tables.rows.some((r) => r.table_name === "stored_file_chunks");
          if (hasFiles && hasChunks) {
            const { rows } = await client.query(
              "select count(*)::int as files, coalesce(sum(size), 0)::bigint as bytes from stored_files where is_complete",
            );
            const mb = (Number(rows[0].bytes) / (1024 * 1024)).toFixed(1);
            ok(`upload storage ready (${rows[0].files} file(s), ${mb} MB)`);
          } else {
            fail(
              "the upload storage tables are missing (stored_files / stored_file_chunks)",
              "Run `npm run db:push` — uploads will fail until these exist.",
            );
          }
        }
      } catch (err) {
        fail(`query failed: ${err.message}`, "Check the user/password/database name in DATABASE_URL.");
      } finally {
        await client.end().catch(() => {});
      }
    }
  }
}

console.log("\nSummary");
if (problems.length === 0) {
  console.log("  Everything checks out — `npm run dev` and open http://localhost:3000\n");
} else {
  console.log(`  ${problems.length} thing(s) to fix above. The preview will stay broken until the database is reachable.\n`);
  process.exit(1);
}
