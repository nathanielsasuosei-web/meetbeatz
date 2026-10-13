import path from "path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { beats, licenses, orders } from "@/db/schema";
import { getReadyFile, storedFileResponse } from "@/lib/files";
import { deliverableList, slugify } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const file = (url.searchParams.get("file") ?? "mp3").toLowerCase();

  const [row] = await db
    .select({ license: licenses, orderStatus: orders.status })
    .from(licenses)
    .innerJoin(orders, eq(licenses.orderId, orders.id))
    .where(eq(licenses.downloadToken, token))
    .limit(1);
  if (!row) return new Response("This download link is invalid.", { status: 404 });
  if (row.orderStatus !== "paid") return new Response("Payment has not been confirmed for this download.", { status: 403 });
  const license = row.license;
  const isVideoDownload = file === "video";
  // Beat-page videos are public previews for streaming, but the downloadable
  // attachment is only available through a paid license token. Payment was
  // checked above before this special file type is allowed.
  if (!isVideoDownload && !deliverableList(license.deliverables).includes(file)) {
    return new Response("Your license does not include this file type.", { status: 403 });
  }
  if (!license.beatId) return new Response("The beat for this license is no longer available. Contact the producer.", { status: 410 });

  const [beat] = await db.select().from(beats).where(eq(beats.id, license.beatId)).limit(1);
  if (!beat) return new Response("The beat for this license is no longer available. Contact the producer.", { status: 410 });

  const rel = isVideoDownload ? beat.videoPath : file === "mp3" ? beat.mp3Path : file === "wav" ? beat.wavPath : beat.stemsPath;
  const stored = await getReadyFile(rel);
  if (!stored || !rel) {
    return new Response(isVideoDownload ? "This beat has no downloadable video preview." : "This file has not been uploaded yet. Please contact the producer.", { status: 404 });
  }

  await db
    .update(licenses)
    .set({ downloadCount: sql`${licenses.downloadCount} + 1` })
    .where(eq(licenses.id, license.id));

  const ext = path.extname(stored.path);
  return storedFileResponse(rel, {
    downloadName: `${slugify(beat.title)}-${file}-meetbeatz${ext}`,
    rangeHeader: req.headers.get("range"),
  });
}
