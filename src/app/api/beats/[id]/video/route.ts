import { eq } from "drizzle-orm";
import { db } from "@/db";
import { beats } from "@/db/schema";
import { getReadyFile, storedFileResponse } from "@/lib/files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Streams a beat's video preview (visualizer, studio clip, …) set by the admin. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beatId = parseInt(id, 10);
  if (!Number.isFinite(beatId)) return new Response("Not found", { status: 404 });
  const [beat] = await db.select().from(beats).where(eq(beats.id, beatId)).limit(1);
  if (!beat?.videoPath) return new Response("Not found", { status: 404 });

  const rel = beat.videoPath;
  if (!(await getReadyFile(rel))) return new Response("Video not available", { status: 404 });
  // Range support is what lets <video> seek without downloading the whole file.
  return storedFileResponse(rel, { rangeHeader: req.headers.get("range"), cache: true });
}
