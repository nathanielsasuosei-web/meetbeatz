import { eq } from "drizzle-orm";
import { db } from "@/db";
import { soundKits } from "@/db/schema";
import { getAdminSession } from "@/lib/auth";
import { storedFileResponse } from "@/lib/files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id) || id <= 0) return new Response("Not found", { status: 404 });

  const [kit] = await db.select().from(soundKits).where(eq(soundKits.id, id)).limit(1);
  if (!kit) return new Response("Not found", { status: 404 });

  return storedFileResponse(kit.filePath, {
    downloadName: kit.fileName,
    rangeHeader: req.headers.get("range"),
  });
}