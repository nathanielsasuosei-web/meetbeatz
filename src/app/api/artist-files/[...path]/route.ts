import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { distributionReleases, remoteSessions } from "@/db/schema";
import { getAdminSession } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";
import { storedFileResponse } from "@/lib/files";

export const dynamic = "force-dynamic";
/** A master is streamed in ranges; a slow connection can hold one open a while. */
export const maxDuration = 60;

/**
 * Streams files an artist uploaded: release artwork, the finished master
 * submitted for distribution, and takes from the browser studio.
 *
 * Artwork is public (it is about to be printed on every store anyway). Masters
 * and takes are **unreleased music**, so they are served only to the producer or
 * to the artist whose release/session row references that exact path — never by
 * guessing the URL. `/api/media/[...path]` deliberately stays limited to
 * `covers/` for the same reason.
 */

const ARTWORK_KIND = "artwork";
const PRIVATE_KINDS = new Set(["masters", "takes"]);

function normalize(path: string[]): string | null {
  const rel = path.join("/");
  // Two segments only (`kind/filename`), no traversal, no absolute paths — the
  // same shape the uploader writes.
  if (!rel || rel.startsWith("/") || rel.split("/").length !== 2 || rel.split("/").some((part) => !part || part === "..")) {
    return null;
  }
  return rel;
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = normalize(path);
  if (!rel) return new Response("Not found", { status: 404 });

  const [kind] = rel.split("/");
  if (kind === ARTWORK_KIND) return storedFileResponse(rel, { cache: true, rangeHeader: req.headers.get("range") });
  if (!PRIVATE_KINDS.has(kind)) return new Response("Not found", { status: 404 });

  const range = req.headers.get("range");

  // The producer can always hear a submission.
  if (await getAdminSession()) return storedFileResponse(rel, { rangeHeader: range });

  const customer = await getCustomerSession();
  if (!customer) return new Response("Not found", { status: 404 });

  const [release] = await db
    .select({ id: distributionReleases.id })
    .from(distributionReleases)
    .where(and(eq(distributionReleases.customerId, customer.id), eq(distributionReleases.audioPath, rel)))
    .limit(1);
  if (release) return storedFileResponse(rel, { rangeHeader: range });

  const [session] = await db
    .select({ id: remoteSessions.id })
    .from(remoteSessions)
    .where(and(eq(remoteSessions.customerId, customer.id), eq(remoteSessions.takePath, rel)))
    .limit(1);
  if (session) return storedFileResponse(rel, { rangeHeader: range });

  // 404 rather than 403: confirming that a path exists is itself a leak.
  return new Response("Not found", { status: 404 });
}
