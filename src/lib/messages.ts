import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerMessages, customers, type CustomerMessage } from "@/db/schema";

/** Support chat: one thread per customer, with system notices in between. */

export type MessageRole = "customer" | "admin" | "system";

export type ChatMessage = {
  id: number;
  fromRole: MessageRole;
  body: string;
  createdAt: string;
  read: boolean;
};

export type ChatThread = {
  customerId: number;
  name: string;
  email: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

function toMessage(row: CustomerMessage): ChatMessage {
  return {
    id: row.id,
    fromRole: (["customer", "admin", "system"] as string[]).includes(row.fromRole)
      ? (row.fromRole as MessageRole)
      : "customer",
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    read: !!row.readAt,
  };
}

export async function listThreadMessages(customerId: number): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(customerMessages)
    .where(eq(customerMessages.customerId, customerId))
    .orderBy(asc(customerMessages.createdAt), asc(customerMessages.id));
  return rows.map(toMessage);
}

const GREETING =
  "Thanks for reaching out! 🎧 This chat goes straight to Meetbeatz — you'll see the reply right here. " +
  "Everything you have bought is in your Account page while you wait.";

/**
 * Posts a customer message. The very first message in a thread also gets an
 * instant system reply, so the artist is never left staring at an empty box.
 */
export async function postCustomerMessage(customerId: number, body: string): Promise<ChatMessage[]> {
  const text = body.trim().slice(0, 2000);
  if (!text) throw new Error("Write a message first.");
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(customerMessages)
    .where(eq(customerMessages.customerId, customerId));
  await db.insert(customerMessages).values({ customerId, fromRole: "customer", body: text });
  if (!count) {
    await db.insert(customerMessages).values({ customerId, fromRole: "system", body: GREETING });
  }
  return listThreadMessages(customerId);
}

export async function postAdminReply(customerId: number, body: string): Promise<ChatMessage[]> {
  const text = body.trim().slice(0, 2000);
  if (!text) throw new Error("Write a reply first.");
  await db.insert(customerMessages).values({ customerId, fromRole: "admin", body: text });
  await markCustomerMessagesRead(customerId);
  return listThreadMessages(customerId);
}

/** Marks the customer's messages as seen — called when the admin opens or answers a thread. */
export async function markCustomerMessagesRead(customerId: number): Promise<void> {
  await db
    .update(customerMessages)
    .set({ readAt: new Date() })
    .where(and(eq(customerMessages.customerId, customerId), eq(customerMessages.fromRole, "customer"), sql`${customerMessages.readAt} IS NULL`));
}

export async function listThreads(): Promise<ChatThread[]> {
  const rows = await db.execute(sql`
    SELECT c.id, c.name, c.email,
           COUNT(m.id) FILTER (WHERE m.from_role = 'customer' AND m.read_at IS NULL)::int AS unread,
           (ARRAY_AGG(m.body ORDER BY m.created_at DESC, m.id DESC))[1] AS last_body,
           MAX(m.created_at) AS last_at
    FROM customers c
    JOIN customer_messages m ON m.customer_id = c.id
    GROUP BY c.id, c.name, c.email
    ORDER BY MAX(m.created_at) DESC
  `);
  return (rows.rows as { id: number; name: string; email: string; unread: number; last_body: string; last_at: Date }[]).map((r) => ({
    customerId: r.id,
    name: r.name,
    email: r.email,
    lastBody: r.last_body ?? "",
    lastAt: (r.last_at instanceof Date ? r.last_at : new Date(r.last_at)).toISOString(),
    unread: r.unread ?? 0,
  }));
}

export async function threadCustomer(customerId: number): Promise<{ id: number; name: string; email: string } | null> {
  const [row] = await db
    .select({ id: customers.id, name: customers.name, email: customers.email })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return row ?? null;
}

/** Admin replies the customer has not seen yet — drives the chat-widget badge. */
export async function unreadReplyCount(customerId: number): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(customerMessages)
    .where(and(eq(customerMessages.customerId, customerId), eq(customerMessages.fromRole, "admin"), sql`${customerMessages.readAt} IS NULL`));
  return count;
}

/** Marks the admin's replies as seen — called when the customer opens the chat. */
export async function markAdminMessagesRead(customerId: number): Promise<void> {
  await db
    .update(customerMessages)
    .set({ readAt: new Date() })
    .where(and(eq(customerMessages.customerId, customerId), eq(customerMessages.fromRole, "admin"), sql`${customerMessages.readAt} IS NULL`));
}
