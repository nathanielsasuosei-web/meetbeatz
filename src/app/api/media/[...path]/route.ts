import { storedFileResponse } from "@/lib/files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Serves public assets (cover art) that were uploaded by the admin. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = path.join("/");
  if (!rel.startsWith("covers/")) return new Response("Not found", { status: 404 });
  return storedFileResponse(rel, { cache: true });
}
