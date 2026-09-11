import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDb?: ReturnType<typeof drizzle>;
};

export type DatabaseUrlResolution =
  | { url: string; source: string }
  | { url: undefined; source: undefined; reason: "missing" | "invalid" };

const URL_CANDIDATES = [
  "DATABASE_URL",
  // Vercel's Supabase integration provides these instead — accept them so a
  // connected project works with zero extra configuration.
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

/**
 * Picks the first candidate that is a parseable connection URI.
 * A set-but-garbled value (psql command, quoted string, bare host, ...)
 * is skipped instead of crashing the app.
 */
export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): DatabaseUrlResolution {
  let sawValue = false;
  for (const name of URL_CANDIDATES) {
    const value = env[name]?.trim();
    if (!value) continue;
    sawValue = true;
    try {
      new URL(value);
      return { url: value, source: name };
    } catch {
      continue;
    }
  }
  return { url: undefined, source: undefined, reason: sawValue ? "invalid" : "missing" };
}

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
  const resolved = resolveDatabaseUrl();
  if (resolved.url === undefined) {
    throw new Error(
      resolved.reason === "invalid"
        ? "DATABASE_URL is set but is not a valid connection URI (it must start with postgresql:// and contain no quotes, spaces, or [placeholders]). Fix it in Vercel → Settings → Environment Variables and redeploy."
        : "DATABASE_URL is not set. Add it to .env for local development, or connect Supabase / add it in your hosting dashboard (Vercel → Settings → Environment Variables) and redeploy.",
    );
  }

  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: resolved.url,
      ssl: sslConfig(resolved.url),
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
