import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Core tables the app cannot render without. If these are missing the database
// is reachable but the schema was never created.
const REQUIRED_TABLES = ["admins", "settings", "beats", "licenses", "orders"] as const;

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
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return Response.json(
      {
        ok: false,
        connected: false,
        reason: "DATABASE_URL is not set",
        hint: "Add DATABASE_URL to your environment (Vercel → Settings → Environment Variables) and redeploy.",
      },
      { status: 500 },
    );
  }

  const target = describeTarget(databaseUrl);

  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const isLoopback = /^(127\.0\.0\.1|localhost|\[?::1\]?)(:|$)/.test(target.host ?? "");
    return Response.json(
      {
        ok: false,
        connected: false,
        ...target,
        reason,
        hint: isLoopback
          ? "DATABASE_URL points at 127.0.0.1/localhost. Serverless hosts cannot reach a database running on their own machine — use a hosted PostgreSQL URL (Neon, Supabase, Railway, …)."
          : "Check that the database is running, reachable from this host, and that the credentials are correct. Hosted Postgres usually needs ?sslmode=require on the URL.",
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
          ...target,
          reason: `Connected, but missing tables: ${missing.join(", ")}`,
          hint: "The connection works, so the schema was never created. Run `npx drizzle-kit push` with this same DATABASE_URL (from your machine or CI), then reload.",
        },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, connected: true, ...target, tables: present.size });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        ok: false,
        connected: true,
        ...target,
        reason: `Connected, but the schema check failed: ${reason}`,
        hint: "Run `npx drizzle-kit push` with this same DATABASE_URL, then reload.",
      },
      { status: 500 },
    );
  }
}
