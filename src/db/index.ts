import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDb?: ReturnType<typeof drizzle>;
};

function sslConfig(databaseUrl: string): { rejectUnauthorized: boolean } | undefined {
  // An explicit ?sslmode=... in the URL always wins — node-postgres honors it.
  if (/[?&]sslmode=/.test(databaseUrl)) return undefined;
  // Hosted Postgres (Supabase pooler, Railway, Neon, ...) expects TLS.
  // Local Postgres usually has SSL off, and node-postgres does NOT fall back
  // to plaintext when TLS is requested — so only enable it for remote hosts.
  const isLocalhost = /(^|[@:/])(localhost|127\.0\.0\.1)([:/?]|$)/.test(databaseUrl);
  return isLocalhost ? undefined : { rejectUnauthorized: false };
}

function ensurePool(): Pool {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env for local development, or to Environment Variables in your hosting dashboard (Vercel → Settings → Environment Variables) and redeploy.",
    );
  }

  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
      ssl: sslConfig(databaseUrl),
    });
  }

  return globalForDb.__arenaNextJsPostgresqlPool;
}

export const pool = new Proxy({} as Pool, {
  get: () => ensurePool(),
});

function ensureDb(): ReturnType<typeof drizzle> {
  if (!globalForDb.__arenaNextJsDb) {
    globalForDb.__arenaNextJsDb = drizzle(ensurePool());
  }
  return globalForDb.__arenaNextJsDb;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get: (_, prop) => {
    return (ensureDb() as any)[prop];
  },
});
