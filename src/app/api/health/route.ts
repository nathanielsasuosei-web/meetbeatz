import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Checks = Record<string, boolean | number | string>;

/**
 * Deployment diagnostics — intentionally does NOT seed or migrate, so it
 * reports the raw state: env vars present? reachable? tables exist? seeded?
 * Safe to expose: values are booleans/counts only, never secrets.
 */
export async function GET() {
  const checks: Checks = {
    databaseUrlSet: !!process.env.DATABASE_URL?.trim(),
    adminEmailSet: !!process.env.ADMIN_EMAIL?.trim(),
    adminPasswordSet: !!process.env.ADMIN_PASSWORD?.trim(),
    sessionSecretSet: !!process.env.SESSION_SECRET?.trim(),
  };

  try {
    await db.execute(sql`select 1`);
    checks.connect = true;
  } catch (err) {
    checks.connect = false;
    checks.connectError = err instanceof Error ? err.message.slice(0, 220) : String(err).slice(0, 220);
    return Response.json({ ok: false, checks }, { status: 500 });
  }

  try {
    const tables = await db.execute(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    checks.publicTables = (tables.rows[0] as { n: number } | undefined)?.n ?? 0;
  } catch (err) {
    checks.tablesError = err instanceof Error ? err.message.slice(0, 220) : String(err).slice(0, 220);
  }

  for (const table of ["admins", "beats", "license_types"] as const) {
    try {
      const rows = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`);
      checks[table] = (rows.rows[0] as { n: number } | undefined)?.n ?? 0;
    } catch {
      checks[table] = "missing";
    }
  }

  const ok =
    checks.connect === true &&
    typeof checks.publicTables === "number" &&
    checks.publicTables >= 12;
  return Response.json({ ok, checks }, { status: ok ? 200 : 500 });
}
