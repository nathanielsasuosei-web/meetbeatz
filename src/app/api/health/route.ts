import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
        reason: "DATABASE_URL is not set",
        hint: "Add DATABASE_URL to your environment (Vercel → Settings → Environment Variables) and redeploy.",
      },
      { status: 500 },
    );
  }

  const target = describeTarget(databaseUrl);

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, ...target });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const isLoopback = /^(127\.0\.0\.1|localhost|\[?::1\]?)(:|$)/.test(target.host ?? "");
    return Response.json(
      {
        ok: false,
        ...target,
        reason,
        hint: isLoopback
          ? "DATABASE_URL points at 127.0.0.1/localhost. Serverless hosts cannot reach a database on their own machine — use a hosted PostgreSQL URL (Neon, Supabase, Railway, …)."
          : "Check that the database is running, reachable from this host, and that the credentials are correct.",
      },
      { status: 500 },
    );
  }
}
