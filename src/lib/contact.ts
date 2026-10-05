import { desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactMessages, type ContactMessage } from "@/db/schema";
import { sendEmail } from "./email";
import { emailLayout } from "./email-templates";
import { getSettings, type SiteSettings } from "./settings";
import { getBaseUrl } from "./url";

/**
 * Website enquiries from the public contact page.
 *
 * Every submission is stored in `contact_messages` (so nothing is lost when
 * email is not configured) and, when a provider is set up, a copy is emailed
 * to the address in Admin → Settings.
 */

export const CONTACT_TOPICS = [
  { value: "beat", label: "Buying a beat or license" },
  { value: "licensing", label: "Licensing question" },
  { value: "studio", label: "Studio booking" },
  { value: "refund", label: "Refund or order problem" },
  { value: "other", label: "Something else" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];

export const TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  CONTACT_TOPICS.map((t) => [t.value, t.label]),
);

export type ContactInput = {
  name: string;
  email: string;
  phone?: string;
  topic?: string;
  orderReference?: string;
  body: string;
  source?: string;
};

export class ContactError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Validates and stores an enquiry, then notifies the studio by email. */
export async function createContactMessage(input: ContactInput): Promise<ContactMessage> {
  const name = clean(input.name, 120);
  const email = clean(input.email, 180).toLowerCase();
  const phone = clean(input.phone, 40);
  const body = String(input.body ?? "").trim().slice(0, 4000);
  const topic = CONTACT_TOPICS.some((t) => t.value === input.topic) ? (input.topic as ContactTopic) : "other";
  const orderReference = clean(input.orderReference, 60);

  if (name.length < 2) throw new ContactError("Please tell us your name.");
  if (!EMAIL_RE.test(email)) throw new ContactError("That email address does not look right.");
  if (body.length < 10) throw new ContactError("Please add a little more detail (at least 10 characters).");

  const [row] = await db
    .insert(contactMessages)
    .values({ name, email, phone, topic, orderReference, body, source: clean(input.source, 40) || "contact" })
    .returning();

  // The enquiry is saved either way — a mail failure must not look like a
  // failed submission to the artist who just wrote in.
  await notifyStudio(row).catch((err) => {
    console.error("[contact] could not email the studio", err);
  });

  return row;
}

async function notifyStudio(row: ContactMessage) {
  let settings: SiteSettings;
  try {
    settings = await getSettings();
  } catch {
    return;
  }
  const to = settings.notifyEmail?.trim() || settings.contactEmail;
  if (!to) return;

  const baseUrl = await getBaseUrl();
  const rows = [
    ["Name", row.name],
    ["Email", row.email],
    ["Phone", row.phone || "—"],
    ["Topic", TOPIC_LABELS[row.topic] ?? row.topic],
    ["Order reference", row.orderReference || "—"],
    ["Page", row.source],
  ];
  const html = emailLayout({
    title: "New website enquiry",
    preheader: `${row.name} — ${TOPIC_LABELS[row.topic] ?? row.topic}`,
    settings,
    baseUrl,
    body: `
      <h1 style="margin:0 0 6px 0;font-size:20px;color:#f4f1ea">New website enquiry</h1>
      <p style="margin:0 0 18px 0;color:#8b8b95;font-size:13px">Reply directly to this email to answer ${row.name}.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:6px 0;color:#8b8b95;font-size:13px;width:140px">${label}</td><td style="padding:6px 0;color:#f4f1ea;font-size:13px">${value}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="margin:18px 0 0 0;padding-top:14px;border-top:1px solid #26262c;color:#f4f1ea;font-size:14px;line-height:1.7;white-space:pre-wrap">${row.body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</p>
    `,
  });

  await sendEmail({ to, subject: `Website enquiry — ${row.name}`, html });
}

/** Newest first. `unhandledOnly` powers the badge in the admin nav area. */
export async function listContactMessages(limit = 40) {
  return db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(limit);
}

export async function unhandledContactCount(): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(contactMessages)
    .where(isNull(contactMessages.handledAt));
  return row?.value ?? 0;
}

export async function setContactHandled(id: number, handled: boolean) {
  await db
    .update(contactMessages)
    .set({ handledAt: handled ? new Date() : null })
    .where(eq(contactMessages.id, id));
}
