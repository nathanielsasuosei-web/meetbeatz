import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "@/lib/database-url";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDb?: ReturnType<typeof drizzle>;
};

function ensurePool(): Pool {
  // Trimmed, unquoted, and falling back to POSTGRES_URL when DATABASE_URL is
  // missing or unusable (Vercel's Postgres integrations set those instead).
  const databaseUrl = resolveDatabaseUrl().value;
  if (!databaseUrl) {
    // During build phase in Vercel, DATABASE_URL might not be available yet.
    // Return early to prevent build failure - actual error will occur at runtime if db is needed.
    if (process.env.NODE_ENV !== "production") {
      throw new Error("DATABASE_URL is required");
    }
    return {} as Pool;
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
