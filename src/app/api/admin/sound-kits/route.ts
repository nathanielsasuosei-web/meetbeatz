import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { soundKits } from "@/db/schema";
import { getAdminSession } from "@/lib/auth";
import { getReadyFile } from "@/lib/files";

export const dynamic = "force-dynamic";

function field(formData: FormData, key: string, maxLength: number): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeFileName(value: string): string {
  const name = value.split(/[\\/]/).pop()?.trim() ?? "sound-kit.zip";
  return name.replace(/[\u0000-\u001f\u007f]+/g, "_").slice(0, 180) || "sound-kit.zip";
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const name = field(formData, "name", 120);
    const description = field(formData, "description", 500);
    const filePath = field(formData, "filePath", 220);
    const fileName = safeFileName(field(formData, "fileName", 220));
    const isPublished = formData.get("isPublished") === "on" || formData.get("isPublished") === "true";

    if (!name) return Response.json({ error: "Sound kit name is required." }, { status: 400 });
    if (!filePath) return Response.json({ error: "Upload a sound kit file first." }, { status: 400 });

    const file = await getReadyFile(filePath);
    if (!file || file.kind !== "sound-kits") {
      return Response.json({ error: "That sound kit upload is missing or unfinished. Please upload it again." }, { status: 400 });
    }

    const [kit] = await db
      .insert(soundKits)
      .values({ name, description, filePath: file.path, fileName, fileSize: file.size, isPublished })
      .returning({ id: soundKits.id });

    revalidatePath("/admin/sound-kits");
    revalidatePath("/sound-kits");
    revalidatePath("/");
    return Response.json({ id: kit.id });
  } catch (error) {
    console.error("[admin/sound-kits POST]", error);
    return Response.json({ error: "Could not save the sound kit." }, { status: 500 });
  }
}
