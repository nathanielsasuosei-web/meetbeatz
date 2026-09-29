import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { beats } from "@/db/schema";
import { collectBeatFiles, parseBeatFields, syncBeatPrices, uniqueSlug } from "@/lib/admin-beat";
import { getAdminSession } from "@/lib/auth";
import { UploadError } from "@/lib/upload-error";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const beatId = parseInt(id, 10);
  const [existing] = await db.select().from(beats).where(eq(beats.id, beatId)).limit(1);
  if (!existing) return Response.json({ error: "Beat not found" }, { status: 404 });

  let saved: Awaited<ReturnType<typeof collectBeatFiles>> = {};
  try {
    const fd = await req.formData();
    const fields = parseBeatFields(fd);
    saved = await collectBeatFiles(fd);
    const slug = fields.title !== existing.title ? await uniqueSlug(fields.title, beatId) : existing.slug;
    await db
      .update(beats)
      .set({ ...fields, slug, ...saved, updatedAt: new Date() })
      .where(eq(beats.id, beatId));
    await syncBeatPrices(beatId, fd);
    // Do not delete a replaced file here: another beat may still reference it.
    // Unreferenced uploads are removed by storage's delayed garbage collection.
    revalidatePath("/");
    revalidatePath("/beats");
    revalidatePath(`/beats/${slug}`);
    return Response.json({ id: beatId, slug });
  } catch (err) {
    // Completed uploads stay stored so the admin can correct the form and
    // submit again without re-uploading.
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[admin/beats PATCH]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}
