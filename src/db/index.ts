import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDb?: ReturnType<typeof drizzle>;
};

function isLocalDatabaseUrl(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)[:/]/i.test(url);
}

function poolOptions(databaseUrl: string): PoolConfig {
  const config: PoolConfig = {
    connectionString: databaseUrl,
    // Serverless hosts run many short-lived instances; a small pool per instance
    // keeps hosted databases (Supabase/Neon free tiers) inside their connection
    // limits. Raise it with PG_POOL_MAX on a long-running server.
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  if (!/sslmode=/i.test(databaseUrl) && !isLocalDatabaseUrl(databaseUrl)) {
    // Hosted PostgreSQL refuses unencrypted connections. If the URL does not say
    // sslmode=require, turn TLS on anyway instead of failing with a confusing
    // "no pg_hba.conf entry ... no encryption" error.
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function ensurePool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // During build phase in Vercel, DATABASE_URL might not be available yet.
    // Return early to prevent build failure - actual error will occur at runtime if db is needed.
    if (process.env.NODE_ENV !== "production") {
      throw new Error("DATABASE_URL is required");
    }
    return {} as Pool;
  }

  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool(poolOptions(databaseUrl));
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
