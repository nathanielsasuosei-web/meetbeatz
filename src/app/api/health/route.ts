import { sql } from "drizzle-orm";
import { db } from "@/db";
import { DATABASE_URL_SOURCES, describeTarget, resolveDatabaseUrl } from "@/lib/database-url";

export const dynamic = "force-dynamic";

/**
 * Reports why the database is unusable, not just that it is. The deployment error page
 * links here, so this is the one place an operator can read the actual cause.
 *
 * Only the source variable name and host:port/database are echoed — never a user or
 * password — so this route can stay public.
 */
function classify(message: string, target: string | null): string {
  const where = target ? ` (${target})` : "";
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return `Could not resolve the database host${where}. For Supabase, the direct connection is IPv6-only on new projects — use the session pooler URL.`;
  if (/ECONNREFUSED/i.test(message)) return `Nothing is accepting connections${where}. Start PostgreSQL, or point the connection string at the instance that is running.`;
  if (/ETIMEDOUT|timeout/i.test(message)) return `Connecting to${where} timed out. Hosted databases usually need SSL enabled and your IP allowed.`;
  if (/self[- ]signed|certificate|SSL/i.test(message)) return `TLS could not be verified${where}. Add ?sslmode=require, or use the pooler URL.`;
  if (/password authentication failed/i.test(message)) return `The credentials in the connection string were rejected for${where}.`;
  if (/does not exist/i.test(message) && /database/i.test(message)) return `The database named in the connection string has not been created. Run \`npm run db:create\`.`;
  if (/relation .* does not exist|no schema/i.test(message)) return `The database is reachable but the tables are missing. Run \`npm run db:push\`.`;
  return `Query failed${where}: ${message}`;
}

export async function GET() {
  const resolved = resolveDatabaseUrl();

  if (!resolved.value) {
    return Response.json(
      {
        ok: false,
        reason: "No database connection string is set for this runtime.",
        checked: DATABASE_URL_SOURCES,
        hint: `Set any one of ${DATABASE_URL_SOURCES.join(", ")} — Locally, copy .env.example to .env. When deployed, use Vercel → Project → Settings → Environment Variables with a hosted PostgreSQL, never localhost.`,
      },
      { status: 503 },
    );
  }

  const target = describeTarget(resolved.value);

  if (process.env.NODE_ENV === "production" && /^localhost:|^127\.|^::1:|^0\.0\.0\.0:/.test(target ?? "")) {
    return Response.json(
      {
        ok: false,
        source: resolved.source,
        database: target,
        reason: "The connection string points at localhost, which is unreachable once deployed.",
        hint: "Replace it with a hosted PostgreSQL connection string (Neon, Railway, Supabase), then run `npm run db:push`.",
      },
      { status: 503 },
    );
  }

  try {
    await db.execute(sql`select 1`);

    // `select 1` succeeds on a brand-new empty database, which is exactly the
    // "drizzle-kit push was never run" case. Probe for a real table so a reachable
    // but uncreated schema is reported as the failure it is.
    const probe = (await db.execute(sql`select to_regclass('public.beats') as t`)) as unknown as {
      rows?: { t: string | null }[];
    };
    if (!probe?.rows?.[0]?.t) {
      return Response.json(
        {
          ok: false,
          source: resolved.source,
          database: target,
          reason: "The database is reachable but its tables have not been created.",
          hint: "Redeploy — `npm run build` syncs the schema first. To do it now, run `npm run db:push` against this same connection string.",
        },
        { status: 503 },
      );
    }

    return Response.json({
      ok: true,
      source: resolved.source,
      database: target,
      ...(resolved.issues.length ? { normalised: resolved.issues } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
    return Response.json(
      { ok: false, source: resolved.source, database: target, reason: classify(`${message} ${cause}`, target) },
      { status: 500 },
    );
  }
}
