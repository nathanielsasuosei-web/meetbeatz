import { fileResponse, resolveUpload } from "@/lib/files";

export const dynamic = "force-dynamic";

/** Serves public assets (cover art) from the uploads folder. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = path.join("/");
  if (!rel.startsWith("covers/")) return new Response("Not found", { status: 404 });
  const abs = resolveUpload(rel);
  if (!abs) return new Response("Not found", { status: 404 });
  return fileResponse(abs, { cache: true });
}
