import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describeTarget, isLoopback, resolveDatabaseUrl } from "@/lib/database-url";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: { url: string; pool: Pool };
  __arenaNextJsDb?: ReturnType<typeof drizzle>;
};

const MISSING_URL =
  "No database connection string found. Set DATABASE_URL, or attach a database that provides " +
  "POSTGRES_URL. Locally, copy .env.example to .env. When deployed, use Vercel → Project → " +
  "Settings → Environment Variables and point it at a hosted PostgreSQL (Neon, Railway, " +
  "Supabase) — never localhost. Then create the tables with `npm run db:push`.";

const LOOPBACK_URL =
  "The configured database points at localhost, which cannot work once deployed — the " +
  "serverless runtime has no local Postgres. Set DATABASE_URL (or attach a Vercel Postgres " +
  "integration so POSTGRES_URL is provided) to a hosted connection string, then run " +
  "`npm run db:push` against that same URL to create the tables.";

/** `next build` runs before every runtime variable is guaranteed present; only then is a
 *  missing URL tolerated, so a misconfigured deploy still builds and fails loudly
 *  at request time with a message that says what to change. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build" || process.argv.includes("build");
}

function ensurePool(): Pool {
  const resolved = resolveDatabaseUrl();

  if (!resolved.value) {
    // Vercel builds before runtime env vars are guaranteed; a stub keeps `next build`
    // alive and the real error surfaces at request time instead.
    if (isBuildPhase()) {
      return {} as Pool;
    }
    throw new Error(MISSING_URL);
  }

  // A loopback URL is correct locally and impossible when deployed. Returning an
  // empty pool here turned a one-line misconfiguration into a blank "Something went
  // wrong" page with no mention of the database, so state the cause instead.
  if (process.env.NODE_ENV === "production" && isLoopback(resolved.value)) {
    throw new Error(LOOPBACK_URL);
  }

  // Cached, but keyed on the resolved URL: the value can change without the module
  // being reloaded (a swapped env var in dev), and reusing the old pool would then
  // query the wrong database while looking like it succeeded.
  if (globalForDb.__arenaNextJsPostgresqlPool?.url !== resolved.value) {
    globalForDb.__arenaNextJsDb = undefined;
    globalForDb.__arenaNextJsPostgresqlPool = {
      url: resolved.value,
      pool: new Pool({ connectionString: resolved.value }),
    };
  }

  return globalForDb.__arenaNextJsPostgresqlPool.pool;
}

export const pool = new Proxy(
  {} as Pool,
  {
    get: () => ensurePool(),
  }
);

function ensureDb(): ReturnType<typeof drizzle> {
  if (!globalForDb.__arenaNextJsDb) {
    globalForDb.__arenaNextJsDb = drizzle(ensurePool());
  }
  return globalForDb.__arenaNextJsDb;
}

export const db = new Proxy(
  {} as ReturnType<typeof drizzle>,
  {
    get: (_, prop) => {
      return (ensureDb() as any)[prop];
    },
  }
);

export { describeTarget, resolveDatabaseUrl };
