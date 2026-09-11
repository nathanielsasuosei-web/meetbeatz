import path from "path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { beats, licenses } from "@/db/schema";
import { fileResponse, resolveUpload } from "@/lib/files";
import { deliverableList, slugify } from "@/lib/format";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  await ensureSeeded();
  const { token } = await params;
  const url = new URL(req.url);
  const file = (url.searchParams.get("file") ?? "mp3").toLowerCase();

  const [license] = await db.select().from(licenses).where(eq(licenses.downloadToken, token)).limit(1);
  if (!license) return new Response("This download link is invalid.", { status: 404 });
  if (!deliverableList(license.deliverables).includes(file)) {
    return new Response("Your license does not include this file type.", { status: 403 });
  }
  if (!license.beatId) return new Response("The beat for this license is no longer available. Contact the producer.", { status: 410 });

  const [beat] = await db.select().from(beats).where(eq(beats.id, license.beatId)).limit(1);
  if (!beat) return new Response("The beat for this license is no longer available. Contact the producer.", { status: 410 });

  const rel = file === "mp3" ? beat.mp3Path : file === "wav" ? beat.wavPath : beat.stemsPath;
  const abs = resolveUpload(rel);
  if (!abs) return new Response("This file has not been uploaded yet. Please contact the producer.", { status: 404 });

  await db
    .update(licenses)
    .set({ downloadCount: sql`${licenses.downloadCount} + 1` })
    .where(eq(licenses.id, license.id));

  const ext = path.extname(abs);
  return fileResponse(abs, {
    downloadName: `${slugify(beat.title)}-${file}-meetbeatz${ext}`,
    rangeHeader: req.headers.get("range"),
  });
}
