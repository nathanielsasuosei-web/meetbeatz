import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDb?: ReturnType<typeof drizzle>;
};

const MISSING_URL =
  "DATABASE_URL is not set. Locally, copy .env.example to .env. When deployed, add DATABASE_URL " +
  "in Vercel → Project → Settings → Environment Variables, pointing at a hosted PostgreSQL " +
  "(Neon, Railway, Supabase) — never localhost. Then create the tables with `npm run db:push`.";

const LOOPBACK_URL =
  "DATABASE_URL points at localhost, which cannot work once deployed — the database has to be " +
  "reachable from the serverless runtime. Set DATABASE_URL in Vercel → Project → Settings → " +
  "Environment Variables to a hosted PostgreSQL connection string, then run `npm run db:push` " +
  "against that same URL to create the tables.";

/** `next build` runs before every runtime variable is guaranteed present; only then is a
 *  missing DATABASE_URL tolerated, so a misconfigured deploy still builds and fails loudly
 *  at request time with a message that says what to change. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build" || process.argv.includes("build");
}

function isLoopback(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return host === "localhost" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.");
  } catch {
    return false;
  }
}

function ensurePool(): Pool {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    // During build phase in Vercel, DATABASE_URL might not be available yet.
    // Return early to prevent build failure - actual error will occur at runtime if db is needed.
    if (isBuildPhase()) {
      return {} as Pool;
    }
    throw new Error(MISSING_URL);
  }

  // A loopback URL is correct locally and impossible when deployed. Returning an
  // empty pool here turned a one-line misconfiguration into a blank "Something went
  // wrong" page with no mention of the database, so state the cause instead.
  if (process.env.NODE_ENV === "production" && isLoopback(databaseUrl)) {
    throw new Error(LOOPBACK_URL);
  }

  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
    });
  }

  return globalForDb.__arenaNextJsPostgresqlPool;
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
