import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { beats } from "@/db/schema";
import { parseBeatFields, removeOldFiles, saveBeatFiles, syncBeatPrices, uniqueSlug, UploadError } from "@/lib/admin-beat";
import { getAdminSession } from "@/lib/auth";
import { deleteUpload } from "@/lib/files";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureSeeded();
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const beatId = parseInt(id, 10);
  const [existing] = await db.select().from(beats).where(eq(beats.id, beatId)).limit(1);
  if (!existing) return Response.json({ error: "Beat not found" }, { status: 404 });

  let saved: Awaited<ReturnType<typeof saveBeatFiles>> = {};
  try {
    const fd = await req.formData();
    const fields = parseBeatFields(fd);
    saved = await saveBeatFiles(fd);
    const slug = fields.title !== existing.title ? await uniqueSlug(fields.title, beatId) : existing.slug;
    await db
      .update(beats)
      .set({ ...fields, slug, ...saved, updatedAt: new Date() })
      .where(eq(beats.id, beatId));
    await syncBeatPrices(beatId, fd);
    await removeOldFiles(existing, saved);
    revalidatePath("/");
    revalidatePath("/beats");
    revalidatePath(`/beats/${slug}`);
    return Response.json({ id: beatId, slug });
  } catch (err) {
    for (const p of Object.values(saved)) await deleteUpload(p);
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[admin/beats PATCH]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}
