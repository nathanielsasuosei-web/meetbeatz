import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerMessages, customers, type CustomerMessage } from "@/db/schema";
import { hashPassword } from "./auth";
import { storedFileExists } from "./files";

/** Private artist ↔ producer chat: one thread per artist, with system notices in between. */

export type MessageRole = "customer" | "admin" | "system";
export type ChatAudioKind = "voice" | "audio";

export type ChatAudioInput = {
  path?: string | null;
  kind?: string | null;
  name?: string | null;
};

export type ChatMessage = {
  id: number;
  fromRole: MessageRole;
  body: string;
  createdAt: string;
  read: boolean;
  audioUrl?: string | null;
  audioKind?: ChatAudioKind | null;
  audioName?: string | null;
};

export type ChatThread = {
  customerId: number;
  name: string;
  email: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

const AUDIO_HEADER_RE = /^\[\[audio:(voice|audio):(chat-audio\/[a-zA-Z0-9._-]+):([^\]]*)\]\]\n?([\s\S]*)$/;
const SAFE_AUDIO_PATH_RE = /^chat-audio\/[a-zA-Z0-9._-]+$/;

export function parseMessageBody(raw: string): {
  body: string;
  audioUrl: string | null;
  audioKind: ChatAudioKind | null;
  audioName: string | null;
  previewText: string;
} {
  const match = AUDIO_HEADER_RE.exec(raw);
  if (!match) {
    return {
      body: raw,
      audioUrl: null,
      audioKind: null,
      audioName: null,
      previewText: raw,
    };
  }
  const audioKind = match[1] as ChatAudioKind;
  const audioPath = match[2];
  const rawName = match[3].trim();
  const body = match[4] ?? "";
  const audioName = rawName || (audioKind === "voice" ? "Voice audio" : "Audio track");
  const icon = audioKind === "voice" ? "🎤" : "🎵";
  const previewText = body ? `${icon} ${audioName} — ${body}` : `${icon} ${audioName}`;

  return {
    body,
    audioUrl: `/api/media/${audioPath}`,
    audioKind,
    audioName,
    previewText,
  };
}

async function formatStoredMessage(text: string, audio?: ChatAudioInput | null): Promise<string> {
  const trimmedText = text.trim().slice(0, 2000);
  const audioPath = audio?.path ? String(audio.path).trim() : "";

  if (!audioPath) {
    if (!trimmedText) throw new Error("Write a message or attach audio first.");
    return trimmedText;
  }

  if (!SAFE_AUDIO_PATH_RE.test(audioPath) || !(await storedFileExists(audioPath))) {
    throw new Error("The attached audio file could not be found. Please upload or record it again.");
  }

  const kind: ChatAudioKind = audio?.kind === "voice" ? "voice" : "audio";
  const defaultName = kind === "voice" ? "Voice audio" : "Audio track";
  const safeName =
    String(audio?.name ?? defaultName)
      .replace(/[\]\r\n]+/g, " ")
      .trim()
      .slice(0, 120) || defaultName;

  const header = `[[audio:${kind}:${audioPath}:${safeName}]]`;
  return trimmedText ? `${header}\n${trimmedText}` : header;
}

function toMessage(row: CustomerMessage): ChatMessage {
  const parsed = parseMessageBody(row.body);
  return {
    id: row.id,
    fromRole: (["customer", "admin", "system"] as string[]).includes(row.fromRole)
      ? (row.fromRole as MessageRole)
      : "customer",
    body: parsed.body,
    createdAt: row.createdAt.toISOString(),
    read: !!row.readAt,
    audioUrl: parsed.audioUrl,
    audioKind: parsed.audioKind,
    audioName: parsed.audioName,
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
export async function postCustomerMessage(
  customerId: number,
  body: string,
  audio?: ChatAudioInput | null,
): Promise<ChatMessage[]> {
  const storedBody = await formatStoredMessage(body, audio);
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(customerMessages)
    .where(eq(customerMessages.customerId, customerId));
  await db.insert(customerMessages).values({ customerId, fromRole: "customer", body: storedBody });
  if (!count) {
    await db.insert(customerMessages).values({ customerId, fromRole: "system", body: GREETING });
  }
  return listThreadMessages(customerId);
}

/**
 * Posts a system notice into a customer's thread — a remote session being
 * confirmed, a release moving to review, anything the artist should see without
 * it looking like the producer typed it.
 *
 * Silently ignores an empty body: a status change with nothing to say should not
 * leave a blank line in the conversation. System notices never carry audio, so
 * they skip `formatStoredMessage`.
 */
export async function postSystemMessage(customerId: number, body: string): Promise<void> {
  const text = body.trim().slice(0, 2000);
  if (!text || !Number.isFinite(customerId) || customerId <= 0) return;
  await db.insert(customerMessages).values({ customerId, fromRole: "system", body: text });
}

export async function postAdminReply(
  customerId: number,
  body: string,
  audio?: ChatAudioInput | null,
): Promise<ChatMessage[]> {
  const storedBody = await formatStoredMessage(body, audio);
  await db.insert(customerMessages).values({ customerId, fromRole: "admin", body: storedBody });
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

const DEFAULT_ARTIST_EMAIL = "artist-caller@meetbeatz.local";

async function ensureDefaultArtistCustomer(): Promise<void> {
  const [anyCustomer] = await db.select({ id: customers.id }).from(customers).limit(1);
  if (anyCustomer) return;
  await db
    .insert(customers)
    .values({
      email: DEFAULT_ARTIST_EMAIL,
      name: "Artist",
      passwordHash: hashPassword("guest-artist-call-only"),
    })
    .onConflictDoNothing();
}

export async function listThreads(): Promise<ChatThread[]> {
  await ensureDefaultArtistCustomer();
  const rows = await db.execute(sql`
    SELECT c.id, c.name, c.email,
           COUNT(m.id) FILTER (WHERE m.from_role = 'customer' AND m.read_at IS NULL)::int AS unread,
           (ARRAY_AGG(m.body ORDER BY m.created_at DESC, m.id DESC) FILTER (WHERE m.body IS NOT NULL))[1] AS last_body,
           COALESCE(MAX(m.created_at), c.created_at) AS last_at
    FROM customers c
    LEFT JOIN customer_messages m ON m.customer_id = c.id
    GROUP BY c.id, c.name, c.email, c.created_at
    ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC, c.id DESC
  `);
  return (rows.rows as { id: number; name: string; email: string; unread: number; last_body: string | null; last_at: Date }[]).map((r) => ({
    customerId: r.id,
    name: r.name,
    email: r.email,
    lastBody: r.last_body ? parseMessageBody(r.last_body).previewText : "Ready for text, voice audio, or audio files",
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
