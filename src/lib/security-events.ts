import { desc, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { securityEvents, type SecurityEvent } from "@/db/schema";
import {
  SECURITY_EVENT_KINDS,
  SECURITY_EVENT_LABELS,
  SECURITY_EVENT_SEVERITY,
  type SecurityEventKind,
} from "./screen-guard";

/**
 * The producer's record of screen-capture attempts against the storefront.
 *
 * Writes come from the browser guard and are unauthenticated by necessity — an
 * anonymous visitor can trip one too — so every field is length-capped here and
 * the route rate-limits per visitor. A reporting endpoint that trusts its input
 * would just be a way to fill the database for free.
 */

export type SecurityEventRow = SecurityEvent & { label: string };

const MAX_DETAIL = 200;
const MAX_PATH = 200;
const MAX_VISITOR = 40;
const MAX_EMAIL = 200;
const MAX_UA = 300;

export function isSecurityEventKind(value: unknown): value is SecurityEventKind {
  return typeof value === "string" && (SECURITY_EVENT_KINDS as readonly string[]).includes(value);
}

/** Clips and cleans one reported string. Never throws: a bad report is still worth keeping. */
function clip(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : "";
  // Collapse control characters and newlines so one report cannot spoof many rows.
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
}

export async function recordSecurityEvent(input: {
  kind: SecurityEventKind;
  detail?: unknown;
  path?: unknown;
  visitorId?: unknown;
  customerEmail?: unknown;
  userAgent?: unknown;
}): Promise<void> {
  await db.insert(securityEvents).values({
    kind: input.kind,
    detail: clip(input.detail, MAX_DETAIL),
    severity: SECURITY_EVENT_SEVERITY[input.kind] ?? "medium",
    path: clip(input.path, MAX_PATH),
    visitorId: clip(input.visitorId, MAX_VISITOR).replace(/[^A-Za-z0-9_-]/g, ""),
    customerEmail: clip(input.customerEmail, MAX_EMAIL),
    userAgent: clip(input.userAgent, MAX_UA),
  });
}

export async function listSecurityEvents(limit = 200): Promise<SecurityEventRow[]> {
  const rows = await db
    .select()
    .from(securityEvents)
    .orderBy(desc(securityEvents.createdAt), desc(securityEvents.id))
    .limit(Math.max(1, Math.min(500, limit)));
  return rows.map((row) => ({ ...row, label: labelFor(row) }));
}

function labelFor(row: SecurityEvent): string {
  return isSecurityEventKind(row.kind) ? SECURITY_EVENT_LABELS[row.kind] : row.kind;
}

/** How many visitors (distinct per-tab ids) tripped the guard in the last N days. */
export async function securityEventStats(days = 7): Promise<{
  total: number;
  visitors: number;
  high: number;
  since: Date;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      visitors: sql<number>`COUNT(DISTINCT ${securityEvents.visitorId})::int`,
      high: sql<number>`COUNT(*) FILTER (WHERE ${securityEvents.severity} = 'high')::int`,
    })
    .from(securityEvents)
    .where(gte(securityEvents.createdAt, since));
  return {
    total: row?.total ?? 0,
    visitors: row?.visitors ?? 0,
    high: row?.high ?? 0,
    since,
  };
}

/** Unread-style badge count for the admin nav: high-severity events in the last 7 days. */
export async function countRecentSecurityEvents(days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(securityEvents)
    .where(gte(securityEvents.createdAt, since));
  return count;
}
