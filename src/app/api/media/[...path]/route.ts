import { getAdminSession } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";
import { storedFileResponse } from "@/lib/files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Serves public assets (cover art) and private artist ↔ producer chat audio. */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = path.join("/");
  const rangeHeader = req.headers.get("range");
  if (rel.startsWith("covers/")) {
    return storedFileResponse(rel, { rangeHeader, cache: true });
  }
  if (rel.startsWith("chat-audio/")) {
    const [admin, customer] = await Promise.all([getAdminSession(), getCustomerSession()]);
    if (!admin && !customer) return new Response("Unauthorized", { status: 401 });
    return storedFileResponse(rel, { rangeHeader, cache: false });
  }
  return new Response("Not found", { status: 404 });
}
