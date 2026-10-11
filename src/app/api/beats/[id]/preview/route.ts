import { eq } from "drizzle-orm";
import { db } from "@/db";
import { beats } from "@/db/schema";
import { getReadyFile, storedFileResponse } from "@/lib/files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beatId = parseInt(id, 10);
  if (!Number.isFinite(beatId)) return new Response("Not found", { status: 404 });
  const [beat] = await db.select().from(beats).where(eq(beats.id, beatId)).limit(1);
  if (!beat) return new Response("Not found", { status: 404 });

  // A public preview is optional. Never fall back to the paid MP3/WAV here:
  // doing so would expose the buyer's master before checkout is confirmed.
  const rel = beat.previewPath;
  if (!rel || !(await getReadyFile(rel))) return new Response("Preview not available", { status: 404 });
  return storedFileResponse(rel, { rangeHeader: req.headers.get("range"), cache: true });
}
