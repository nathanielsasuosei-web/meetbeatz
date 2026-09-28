import { getAdminSession } from "@/lib/auth";
import {
  listThreadMessages,
  listThreads,
  markCustomerMessagesRead,
  postAdminReply,
  threadCustomer,
} from "@/lib/messages";

export const dynamic = "force-dynamic";

/**
 * Support inbox for the admin.
 *   GET /api/admin/messages                 → all threads (with unread counts)
 *   GET /api/admin/messages?customerId=N    → one thread's messages (marks them read)
 *   POST /api/admin/messages { customerId, body } → reply as Meetbeatz
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const customerId = parseInt(url.searchParams.get("customerId") ?? "", 10);
  if (Number.isFinite(customerId)) {
    const customer = await threadCustomer(customerId);
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });
    const messages = await listThreadMessages(customerId);
    await markCustomerMessagesRead(customerId);
    return Response.json({ customer, messages });
  }
  return Response.json({ threads: await listThreads() });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { customerId?: number; body?: string };
  const customerId = Number(body.customerId);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return Response.json({ error: "Pick a conversation to reply to." }, { status: 400 });
  }
  if (!(await threadCustomer(customerId))) return Response.json({ error: "Customer not found" }, { status: 404 });
  try {
    const messages = await postAdminReply(customerId, String(body.body ?? ""));
    return Response.json({ messages });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not send the reply." }, { status: 400 });
  }
}
