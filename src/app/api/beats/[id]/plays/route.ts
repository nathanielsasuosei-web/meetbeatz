import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { beats } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Count a preview only after the browser has actually started playing it.
 *  The player sends one request per playback, not for metadata/range requests or seeks.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) return new Response("Not found", { status: 404 });
  const beatId = Number(id);
  if (!Number.isSafeInteger(beatId)) return new Response("Not found", { status: 404 });

  // Don't let a visitor inflate counts for hidden beats. Sold beats can still have
  // a public video preview on their detail page.
  const [updated] = await db
    .update(beats)
    .set({ plays: sql`${beats.plays} + 1` })
    .where(and(
      eq(beats.id, beatId),
      or(eq(beats.isPublished, true), eq(beats.exclusiveSold, true)),
      or(isNotNull(beats.previewPath), isNotNull(beats.mp3Path), isNotNull(beats.wavPath), isNotNull(beats.videoPath)),
    ))
    .returning({ id: beats.id });

  return new Response(null, { status: updated ? 204 : 404 });
}
