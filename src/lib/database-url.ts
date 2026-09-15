/**
 * Resolves the Postgres connection string from the environment.
 *
 * `DATABASE_URL` is the name this project has always used, but it is not the
 * name every platform uses: connecting a database through Vercel's own
 * Postgres/Neon/Supabase integrations defines `POSTGRES_URL` (and
 * `POSTGRES_URL_NON_POOLING`) instead. Reading only `DATABASE_URL` there makes a
 * perfectly healthy attached database look like "cannot be reached", which is the
 * single most common reason a deployment shows nothing but an error page.
 *
 * Values pasted out of a dashboard also arrive decorated — wrapped in quotes, with
 * a trailing newline — and Postgres rejects them with an error that never mentions
 * the whitespace. So normalise once, here, and let callers report what was wrong.
 */

/** Priority order shared by the app, the schema-push build step and `npm run doctor`. */
export const DATABASE_URL_SOURCES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "PRISMA_SCHEMA_URL",
  "SUPABASE_DATABASE_URL",
] as const;

export type ResolvedDatabaseUrl = {
  /** The usable URL, or "" when nothing is configured. */
  value: string;
  /** Which variable it came from, or null. Useful in error messages and /api/health. */
  source: string | null;
  /** Non-fatal problems found and repaired, safe to display (never contains the password). */
  issues: string[];
};

const POSTGRES_SCHEME = /^postgres(ql)?:\/\//i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

function unquote(raw: string, issues: string[]): string {
  let value = raw.trim();
  if (raw !== value) issues.push("value had leading or trailing whitespace");
  if (/[\r\n]/.test(raw)) issues.push("value contained a line break");

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    value = value.slice(1, -1).trim();
    issues.push("value was wrapped in quotes");
  }
  return value;
}

/**
 * Hosted Postgres requires TLS; a local cluster usually has none. Omitting
 * `sslmode` on a hosted URL fails with an opaque connection reset, so add it for
 * remote hosts only, and never overwrite an explicit choice.
 */
function ensureSslMode(value: string, issues: string[]): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (url.searchParams.has("sslmode") || LOCAL_HOSTS.has(url.hostname.toLowerCase())) return value;
  url.searchParams.set("sslmode", "require");
  issues.push("added sslmode=require for a remote host");
  return url.toString();
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): ResolvedDatabaseUrl {
  const issues: string[] = [];

  for (const source of DATABASE_URL_SOURCES) {
    const raw = env[source];
    if (!raw || !raw.trim()) continue;

    const value = ensureSslMode(unquote(raw, issues), issues);
    if (!POSTGRES_SCHEME.test(value)) {
      // A garbage value in the first variable should not hide a good one later.
      issues.push(`${source} is not a postgresql:// URL`);
      continue;
    }
    return { value, source, issues };
  }

  return { value: "", source: null, issues };
}

/** Host and port only — safe to log. Never returns credentials. */
export function describeTarget(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const database = url.pathname.replace(/^\//, "") || "(no database in URL)";
    return `${url.hostname}:${url.port || "5432"}/${database}`;
  } catch {
    return "unreadable connection string";
  }
}

export function isLoopback(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}
