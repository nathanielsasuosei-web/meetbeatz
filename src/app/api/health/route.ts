import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Reports why the database is unusable, not just that it is. The deployment error page
 * links here, so this is the one place an operator can read the actual cause.
 * Only the host, port and database name are echoed — never the user or password.
 */
function describeTarget(): string | null {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const database = url.pathname.replace(/^\//, "") || "(no database in URL)";
    return `${url.hostname}:${url.port || "5432"}/${database}`;
  } catch {
    return "DATABASE_URL is set but is not a valid postgresql:// URL";
  }
}

function classify(message: string, target: string | null): string {
  const where = target ? ` (${target})` : "";
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return `Could not resolve the database host${where}.`;
  if (/ECONNREFUSED/i.test(message)) return `Nothing is accepting connections${where}. Start PostgreSQL, or point DATABASE_URL at the instance that is running.`;
  if (/ETIMEDOUT|timeout/i.test(message)) return `Connecting to${where} timed out. Hosted databases usually need SSL enabled and your IP allowed.`;
  if (/password authentication failed/i.test(message)) return `The credentials in DATABASE_URL were rejected for${where}.`;
  if (/does not exist/i.test(message) && /database/i.test(message)) return `The database named in DATABASE_URL has not been created. Run \`npm run db:create\`.`;
  if (/relation .* does not exist|no schema/i.test(message)) return `The database is reachable but the tables are missing. Run \`npm run db:push\`.`;
  return `Query failed${where}: ${message}`;
}

export async function GET() {
  const target = describeTarget();

  if (!target) {
    return Response.json(
      {
        ok: false,
        reason: "DATABASE_URL is not set for this runtime.",
        hint: "Locally, copy .env.example to .env. When deployed, add it in Vercel → Project → Settings → Environment Variables and point it at a hosted PostgreSQL, never localhost.",
      },
      { status: 503 },
    );
  }

  if (/^(localhost|127\.|::1|0\.0\.0\.0)/.test(target) && process.env.NODE_ENV === "production") {
    return Response.json(
      {
        ok: false,
        database: target,
        reason: "DATABASE_URL points at localhost, which is unreachable once deployed.",
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
          database: target,
          reason: "The database is reachable but its tables have not been created.",
          hint: "Run `npm run db:push` (drizzle-kit push) against this exact DATABASE_URL. On Vercel this must be run locally or in CI with the production URL, not against localhost.",
        },
        { status: 503 },
      );
    }

    return Response.json({ ok: true, database: target });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, database: target, reason: classify(message, target) }, { status: 500 });
  }
}
