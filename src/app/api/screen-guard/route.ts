import { getCustomerSession } from "@/lib/customer-auth";
import { isSecurityEventKind, recordSecurityEvent } from "@/lib/security-events";
import { normalizeScreenGuardMode } from "@/lib/screen-guard";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Intake for screen-capture incidents reported by the guard in the browser
 * (src/components/screen-guard.tsx).
 *
 * The endpoint is unauthenticated on purpose — an anonymous visitor tripping
 * Print Screen is exactly the case worth recording — so it is written to be
 * boring to abuse: the kind must be one of a fixed list, every string is
 * length-capped in `recordSecurityEvent`, the whole body is capped here, and
 * each visitor gets a small sliding-window budget before reports are dropped
 * silently. Dropping rather than 429-ing keeps a stuck key from turning into a
 * retry storm.
 */

const MAX_BODY_BYTES = 2048;
/** Reports accepted per visitor per window; the rest are discarded. */
const BUDGET = 12;
const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };

/**
 * Per-instance budget. On a serverless host this resets whenever a new instance
 * serves the request, which is fine: the browser guard already dedupes and caps
 * its own reports, and this only exists to stop a scripted client from filling
 * the table.
 */
const budgets = new Map<string, Bucket>();

function budgetKey(req: Request, visitorId: string): string {
  if (visitorId) return `v:${visitorId}`;
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return `ip:${forwarded.split(",")[0]?.trim() || "unknown"}`;
}

function withinBudget(key: string): boolean {
  const now = Date.now();
  const bucket = budgets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    budgets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // The map only ever holds one row per recent visitor, but a long-lived
    // process should not accumulate them forever.
    if (budgets.size > 500) {
      for (const [entry, value] of budgets) if (value.resetAt <= now) budgets.delete(entry);
    }
    return true;
  }
  bucket.count += 1;
  return bucket.count <= BUDGET;
}

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return Response.json({ error: "Could not read the report." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let body: { kind?: unknown; detail?: unknown; path?: unknown; visitorId?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "Malformed report." }, { status: 400 });
  }

  if (!isSecurityEventKind(body.kind)) return Response.json({ error: "Unknown event kind." }, { status: 400 });

  const visitorId = String(body.visitorId ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  if (!withinBudget(budgetKey(req, visitorId))) return Response.json({ ok: true, dropped: true });

  // The guard is off → nothing should be reporting, and nothing is recorded.
  const settings = await getSettings().catch(() => null);
  if (settings && normalizeScreenGuardMode(settings.screenGuard) === "off") {
    return Response.json({ ok: true, dropped: true });
  }

  // The email is read from the session cookie rather than the request body: a
  // report that could name any artist would be a way to frame one.
  const session = await getCustomerSession().catch(() => null);

  try {
    await recordSecurityEvent({
      kind: body.kind,
      detail: body.detail,
      path: body.path,
      visitorId,
      customerEmail: session?.email ?? "",
      userAgent: req.headers.get("user-agent") ?? "",
    });
  } catch (err) {
    // A failed report must not surface as a broken page for the visitor.
    console.error("[screen-guard] could not record incident", err);
    return Response.json({ ok: false }, { status: 500 });
  }

  return Response.json({ ok: true });
}
