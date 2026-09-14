import { db } from "@/db";
import { sql } from "drizzle-orm";
import { describeDatabaseUrlShape, resolveDatabaseUrl } from "@/lib/database-url";

export const dynamic = "force-dynamic";

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
    const reason = error instanceof Error ? error.message : String(error);
    const isLoopback = /^(127\.0\.0\.1|localhost|\[?::1\]?)(:|$)/.test(target.host ?? "");
    const hint = !report.valid
      ? hintForInvalidUrl()
      : isLoopback
        ? "DATABASE_URL points at 127.0.0.1/localhost. Serverless hosts cannot reach a database running on their own machine — use a hosted PostgreSQL URL (Neon, Supabase, Railway, …)."
        : "Check that the database is running, reachable from this host, and that the credentials are correct. Hosted Postgres usually needs ?sslmode=require on the URL.";
    return Response.json(
      {
        ok: false,
        connected: false,
        source,
        ...target,
        ...issues,
        ...(report.valid ? {} : { shape: describeDatabaseUrlShape(process.env.DATABASE_URL) }),
        reason,
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
