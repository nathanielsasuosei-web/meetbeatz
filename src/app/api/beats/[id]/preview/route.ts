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

  const rel = beat.previewPath ?? beat.mp3Path ?? beat.wavPath;
  if (!(await getReadyFile(rel))) return new Response("Preview not available", { status: 404 });
  return storedFileResponse(rel as string, { rangeHeader: req.headers.get("range"), cache: true });
}
