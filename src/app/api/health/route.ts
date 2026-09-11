import { db, resolveDatabaseUrl } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Checks = Record<string, boolean | number | string>;

/**
 * Deployment diagnostics — intentionally does NOT seed or migrate, so it
 * reports the raw state: env vars present? reachable? tables exist? seeded?
 * Safe to expose: booleans/counts/hostnames only, never secrets.
 */

function fullErrorMessage(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && parts.length < 5 && !seen.has(cur)) {
    seen.add(cur);
    if (cur instanceof Error) {
      if (cur.message) parts.push(cur.message);
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  // Scrub anything shaped like credentials, just in case.
  return parts
    .join(" | ")
    .replace(/:\/\/[^/\s:@]+:[^/\s@]+@/g, "://***:***@")
    .slice(0, 500);
}

/** Non-sensitive connection info: host/port/user/db + URL format red flags. */
function connectionInfo(effectiveUrl: string | undefined): Checks {
  const raw = effectiveUrl ?? "";
  const info: Checks = {
    // Catches a pasted-but-unedited placeholder like [YOUR-PASSWORD].
    hasPlaceholderBrackets: raw.includes("[") || raw.includes("]"),
  };
  try {
    const u = new URL(raw);
    info.dbHost = u.hostname || "(missing)";
    info.dbPort = u.port || "(default 5432)";
    info.dbUser = u.username || "(missing)";
    info.dbName = u.pathname.replace(/^\//, "") || "(missing)";
    info.passwordPresent = u.password ? true : false;
  } catch {
    info.dbUrlParses = false;
  }
  return info;
}

export async function GET() {
  const resolved = resolveDatabaseUrl();
  const checks: Checks = {
    databaseUrlSet: !!resolved.url,
    databaseUrlSource: resolved.url
      ? resolved.source
      : `none (${resolved.reason})`,
    adminEmailSet: !!process.env.ADMIN_EMAIL?.trim(),
    adminPasswordSet: !!process.env.ADMIN_PASSWORD?.trim(),
    sessionSecretSet: !!process.env.SESSION_SECRET?.trim(),
    ...connectionInfo(resolved.url),
  };

  try {
    await db.execute(sql`select 1`);
    checks.connect = true;
  } catch (err) {
    checks.connect = false;
    checks.connectError = fullErrorMessage(err);
    return Response.json({ ok: false, checks }, { status: 500 });
  }

  try {
    const tables = await db.execute(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    checks.publicTables = (tables.rows[0] as { n: number } | undefined)?.n ?? 0;
  } catch (err) {
    checks.tablesError = fullErrorMessage(err);
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
