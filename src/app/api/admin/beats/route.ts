import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { beats } from "@/db/schema";
import { parseBeatFields, saveBeatFiles, syncBeatPrices, uniqueSlug, UploadError } from "@/lib/admin-beat";
import { getAdminSession } from "@/lib/auth";
import { deleteUpload } from "@/lib/files";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeeded();
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let saved: Awaited<ReturnType<typeof saveBeatFiles>> = {};
  try {
    const fd = await req.formData();
    const fields = parseBeatFields(fd);
    saved = await saveBeatFiles(fd);
    if (!saved.mp3Path && !saved.wavPath) {
      throw new UploadError("Upload at least the MP3 (or WAV) file that buyers will download.");
    }
    const slug = await uniqueSlug(fields.title);
    const [beat] = await db
      .insert(beats)
      .values({
        ...fields,
        slug,
        coverPath: saved.coverPath ?? null,
        previewPath: saved.previewPath ?? null,
        mp3Path: saved.mp3Path ?? saved.wavPath ?? null,
        wavPath: saved.wavPath ?? null,
        stemsPath: saved.stemsPath ?? null,
      })
      .returning();
    await syncBeatPrices(beat.id, fd);
    revalidatePath("/");
    revalidatePath("/beats");
    return Response.json({ id: beat.id, slug: beat.slug });
  } catch (err) {
    for (const p of Object.values(saved)) await deleteUpload(p);
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[admin/beats POST]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}
