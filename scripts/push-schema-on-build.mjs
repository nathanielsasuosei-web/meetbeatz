import "dotenv/config";
import { spawnSync } from "node:child_process";

/**
 * Syncs the schema to the configured database, as part of `npm run build`.
 *
 * This exists because a deployed preview used to fail site-wide with "tables that were
 * never created" — the app auto-seeds its *rows* on first request, but the tables depended
 * on someone remembering to run `npx drizzle-kit push` by hand against the hosted database,
 * which nobody does on a first deploy.
 *
 * A missing connection string is a warning, not a build failure: platforms often build
 * before a database is attached, and failing there would hide the real fix behind a red
 * deploy. A real push failure (bad credentials, unreachable host, or a destructive change
 * drizzle-kit refuses without a TTY) still fails the build, where it is visible.
 *
 * The variable priority below mirrors src/lib/database-url.ts — Vercel's Postgres
 * integrations set POSTGRES_URL rather than DATABASE_URL, and drizzle-kit only understands
 * DATABASE_URL, so the resolved value is passed down explicitly to the child process.
 * Keep the two lists in sync.
 */
const SOURCES = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "PRISMA_SCHEMA_URL", "SUPABASE_DATABASE_URL"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

function clean(raw) {
  let value = String(raw).trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) value = value.slice(1, -1).trim();
  return value;
}

function withSslMode(value) {
  try {
    const url = new URL(value);
    if (url.searchParams.has("sslmode") || LOCAL_HOSTS.has(url.hostname.toLowerCase())) return value;
    url.searchParams.set("sslmode", "require");
    return url.toString();
  } catch {
    return value;
  }
}

let resolved = null;
for (const name of SOURCES) {
  const value = clean(process.env[name] ?? "");
  if (!value) continue;
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    console.warn(`[build] ignoring ${name}: not a postgresql:// URL`);
    continue;
  }
  resolved = { name, value: withSslMode(value) };
  break;
}

if (!resolved) {
  console.warn(
    "[build] no database connection string found — skipping schema sync.\n" +
      `[build] Set one of ${SOURCES.join(", ")} (a hosted PostgreSQL in CI and preview\n` +
      "[build] environments) and rebuild, or run `npm run db:push` against the target manually.",
  );
  process.exit(0);
}

let host = "(unparsable URL)";
try {
  const url = new URL(resolved.value);
  host = `${url.hostname}:${url.port || "5432"}`;
} catch {
  // keep the placeholder; never print the URL itself, it contains a password
}

console.log(`[build] syncing schema from ${resolved.name} at ${host} ...`);

const result = spawnSync("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  // drizzle.config.ts reads DATABASE_URL; hand it whatever variable was actually set.
  env: { ...process.env, DATABASE_URL: resolved.value },
});

if (result.status !== 0) {
  // Best effort by design. A schema sync that cannot run — no credentials at build
  // time, a pooler that refuses DDL, TLS interception — must not block the deployment
  // that would otherwise boot and explain itself through /api/health. This exact step
  // was briefly fatal here and turned three working preview deployments into failed
  // builds, which is strictly worse than a missing table.
  //
  // Teams that *want* the build to stop on an unsynced schema opt in with
  // REQUIRE_SCHEMA_PUSH=1, where a silent partial deploy is the bigger risk.
  const strict = process.env.REQUIRE_SCHEMA_PUSH === "1";
  const guidance =
    "[build] The app will still deploy; check /api/health after it starts, or run\n" +
    "[build] `npm run db:push` against the same connection string to see the real error.\n" +
    "[build] Set REQUIRE_SCHEMA_PUSH=1 to make this failure stop the build instead.";

  if (strict) {
    console.error("[build] schema sync failed and REQUIRE_SCHEMA_PUSH=1 is set — failing the build.");
    console.error(guidance);
    process.exit(result.status ?? 1);
  }

  console.warn(`[build] schema sync failed (exit ${result.status ?? "unknown"}) — continuing without it.`);
  console.warn(guidance);
  process.exit(0);
}

console.log("[build] schema is up to date.");
