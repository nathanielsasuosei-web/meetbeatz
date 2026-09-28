import { getCustomerSession } from "@/lib/customer-auth";
import { listThreadMessages, markAdminMessagesRead, postCustomerMessage, unreadReplyCount } from "@/lib/messages";

export const dynamic = "force-dynamic";

/**
 * The artist's support chat thread (see the chat widget).
 * GET returns the thread; POST appends a customer message.
 */
export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Sign in to use the chat." }, { status: 401 });
  await markAdminMessagesRead(session.id);
  const [messages, unread] = await Promise.all([listThreadMessages(session.id), unreadReplyCount(session.id)]);
  return Response.json({ messages, unread });
}

export async function POST(req: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Sign in to use the chat." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  try {
    const messages = await postCustomerMessage(session.id, String(body.body ?? ""));
    return Response.json({ messages });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not send the message." }, { status: 400 });
  }
}
