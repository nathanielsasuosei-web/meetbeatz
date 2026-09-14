import { Client } from "pg";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  describeDatabaseUrlShape,
  listDatabaseUrlCandidates,
  resolveDatabaseUrl,
} from "@/lib/database-url";

export const dynamic = "force-dynamic";

/** drizzle reports "Failed query: select 1"; the real reason sits in the cause chain. */
function underlyingError(error: unknown, depth = 0): string {
  if (!error || depth > 4 || typeof error !== "object") return String(error ?? "unknown error");
  const { message, cause } = error as { message?: string; cause?: unknown };
  if (cause) {
    const nested = underlyingError(cause, depth + 1);
    if (nested) return nested;
  }
  return message ?? String(error);
}

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "unparseable";
  }
}

/** Try each remaining candidate so the response says which URLs actually work. */
async function probeAlternatives(usedSource: string | null) {
  const others = listDatabaseUrlCandidates().filter((candidate) => candidate.name !== usedSource);
  const results = await Promise.all(
    others.map(async (candidate) => {
      const client = new Client({
        connectionString: candidate.value,
        connectionTimeoutMillis: 8000,
      });
      try {
        await client.connect();
        await client.query("select 1");
        return { name: candidate.name, host: hostOf(candidate.value), ok: true as const };
      } catch (error) {
        return {
          name: candidate.name,
          host: hostOf(candidate.value),
          ok: false as const,
          error: underlyingError(error),
        };
      } finally {
        await client.end().catch(() => {});
      }
    }),
  );
  return results;
}

// Core tables the app cannot render without. If these are missing the database
// is reachable but the schema was never created.
const REQUIRED_TABLES = ["admins", "settings", "beats", "licenses", "orders"] as const;

// Tools whose output people paste into the DATABASE_URL box by mistake.
const COMMAND_PREFIXES = [
  "psql",
  "pg_dump",
  "pg_restore",
  "pgbench",
  "heroku",
  "pgpassword",
  "docker",
  "npx",
  "npm",
  "node",
  "supabase",
  "railway",
];

/**
 * Explain an unusable DATABASE_URL without ever echoing the password: the
 * shape tells us whether it is a shell command, a JDBC URL or a bare host.
 */
function hintForInvalidUrl(): string {
  const shape = describeDatabaseUrlShape(process.env.DATABASE_URL);
  const scheme = shape.scheme?.toLowerCase() ?? "";

  if (COMMAND_PREFIXES.some((command) => scheme === command || scheme.startsWith(`${command}=`))) {
    return `DATABASE_URL starts with "${shape.scheme}" — that is a shell command, not a URL. Copy only the postgresql://… part (it usually sits inside quotes), and paste that alone.`;
  }
  if (scheme === "jdbc") {
    return "This is a JDBC URL (jdbc:postgresql://…). Postgres needs the plain form: postgresql://user:password@host:5432/database.";
  }
  if (!shape.hasAuthority) {
    return "DATABASE_URL has no \"postgresql://\" prefix. It must be a full connection string: postgresql://user:password@host:5432/database.";
  }
  if (shape.nonAsciiCount > 0) {
    return "DATABASE_URL contains non-ASCII characters (smart quotes or dashes from a copy-paste). Retype it, or copy it from the provider's plain-text connection string.";
  }
  return "DATABASE_URL is not a valid postgres URL — it must look like postgresql://user:password@host:5432/database, with no spaces, quotes or line breaks.";
}

function describeTarget(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    // Never echo credentials — host and database name only.
    return { host: url.host, database: url.pathname.replace(/^\//, "") || undefined };
  } catch {
    return { host: "unparseable DATABASE_URL" };
  }
}

export async function GET() {
  const resolved = resolveDatabaseUrl();
  const report = resolved.report;
  // Reported whenever the raw value needed cleaning, even if the connection works.
  const issues = report.issues.length > 0 ? { issues: report.issues } : {};
  const source = resolved.source;

  if (!resolved.value) {
    return Response.json(
      {
        ok: false,
        connected: false,
        source: null,
        reason: report.value ? "DATABASE_URL is not usable" : "DATABASE_URL is not set",
        hint: "Add DATABASE_URL (postgresql://user:password@host:5432/database) in Vercel → Settings → Environment Variables, or connect a Postgres integration that provides POSTGRES_URL / POSTGRES_URL_NON_POOLING, then redeploy.",
        ...issues,
        ...(report.valid ? {} : { shape: describeDatabaseUrlShape(process.env.DATABASE_URL) }),
      },
      { status: 500 },
    );
  }

  const target = describeTarget(resolved.value);

  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    const reason = underlyingError(error);
    const alternatives = await probeAlternatives(source);
    const isLoopback = /^(127\.0\.0\.1|localhost|\[?::1\]?)(:|$)/.test(target.host ?? "");
    const working = alternatives.find((candidate) => candidate.ok);

    const hint = working
      ? `${source} (${target.host}) cannot connect: ${reason}. ${working.name} (${working.host}) connects fine — set DATABASE_URL to that value and redeploy.`
      : !report.valid && source === "DATABASE_URL"
        ? hintForInvalidUrl()
        : isLoopback
          ? "DATABASE_URL points at 127.0.0.1/localhost. Serverless hosts cannot reach a database running on their own machine — use a hosted PostgreSQL URL (Neon, Supabase, Railway, …)."
          : `Connected target ${target.host} rejected the query: ${reason}. Check the host, port, database name, password, and that the database is reachable from this host — Supabase's transaction pooler (port 6543) often needs the session-mode URL on port 5432 instead.`;
    return Response.json(
      {
        ok: false,
        connected: false,
        source,
        ...target,
        ...issues,
        ...(report.valid ? {} : { shape: describeDatabaseUrlShape(process.env.DATABASE_URL) }),
        reason,
        ...(alternatives.length > 0 ? { alternatives } : {}),
        hint,
      },
      { status: 500 },
    );
  }

  try {
    const result = await db.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (${sql.join(
          REQUIRED_TABLES.map((table) => sql`${table}`),
          sql`, `,
        )})
    `);
    const present = new Set(
      (result.rows as { table_name: string }[]).map((row) => row.table_name),
    );
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table));

    if (missing.length > 0) {
      return Response.json(
        {
          ok: false,
          connected: true,
          source,
          ...target,
          ...issues,
          reason: `Connected, but missing tables: ${missing.join(", ")}`,
          hint: "The connection works, so the schema was never created. Run `npx drizzle-kit push` with this same DATABASE_URL (from your machine or CI), then reload.",
        },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, connected: true, source, ...target, ...issues, tables: present.size });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        ok: false,
        connected: true,
        source,
        ...target,
        ...issues,
        reason: `Connected, but the schema check failed: ${reason}`,
        hint: "Run `npx drizzle-kit push` with this same DATABASE_URL, then reload.",
      },
      { status: 500 },
    );
  }
}
