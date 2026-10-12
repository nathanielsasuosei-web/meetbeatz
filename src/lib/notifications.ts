import { desc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, type Booking, type Order } from "@/db/schema";
import { formatDate, money, num } from "./format";
import { getSettings } from "./settings";
import { normalizeWhatsAppNumber, sendWhatsAppAlert } from "./whatsapp";

/**
 * The producer's on-site inbox. Every studio booking posts a message here the
 * moment it happens (request, then payment confirmed) — and the same text is
 * pushed to the producer's WhatsApp when that is configured.
 */

export type AdminNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  reference: string;
  link: string;
  read: boolean;
  createdAt: Date;
};

export async function listNotifications(limit = 100): Promise<AdminNotification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    reference: r.reference,
    link: r.link,
    read: !!r.readAt,
    createdAt: r.createdAt,
  }));
}

export async function countUnreadNotifications(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(notifications)
    .where(isNull(notifications.readAt));
  return count;
}

export async function markAllNotificationsRead(): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(isNull(notifications.readAt));
}

/**
 * Builds the booking alert shown in the inbox and sent on WhatsApp.
 * One source of truth so the two channels never drift apart.
 */
export function bookingAlertText(
  booking: Booking,
  order: Order | null,
  phase: "request" | "confirmed",
): { title: string; body: string } {
  const when = `${formatDate(booking.bookingDate)} · ${booking.startTime}–${booking.endTime} (${booking.hours}h)`;
  const contact = [booking.customerName, booking.customerPhone, booking.customerEmail].filter(Boolean).join(" · ");
  const customerWhatsApp = normalizeWhatsAppNumber(booking.customerPhone);
  const reply = customerWhatsApp ? `Reply on WhatsApp: https://wa.me/${customerWhatsApp}` : "";

  if (phase === "request") {
    return {
      title: `New studio booking — ${booking.customerName}`,
      body: [
        `New studio booking request 🎧`,
        `${booking.serviceName} — ${when}`,
        `Customer: ${contact}`,
        booking.notes ? `Notes: ${booking.notes}` : "",
        `Deposit ${money(order?.subtotal ?? 0, order?.currency)} · ref ${order?.reference ?? "—"}`,
        `Payment is pending — confirm once it lands.`,
        reply,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  const paid = num(booking.amountPaid);
  const balance = Math.max(0, num(booking.sessionPrice) - paid);
  return {
    title: `Booking confirmed — ${booking.customerName}`,
    body: [
      `Deposit received ✅ — the booking is confirmed`,
      `${booking.serviceName} — ${when}`,
      `Customer: ${contact}`,
      `Paid ${money(paid, order?.currency)} of ${money(booking.sessionPrice, order?.currency)}`,
      balance > 0 ? `Balance ${money(balance, order?.currency)} at the studio.` : "Fully paid.",
      `Ref ${order?.reference ?? "—"}`,
      reply,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Posts a booking alert to the producer's inbox and their WhatsApp when it is
 * configured. The WhatsApp request is awaited deliberately: serverless
 * runtimes may stop executing as soon as a response is returned, which would
 * make fire-and-forget delivery unreliable. The sender itself fails soft, so
 * a WhatsApp outage still cannot fail checkout.
 */
export async function notifyBooking(booking: Booking, order: Order | null, phase: "request" | "confirmed"): Promise<void> {
  const { title, body } = bookingAlertText(booking, order, phase);
  const kind = phase === "request" ? "booking_request" : "booking_confirmed";
  // A reference is always present for normal checkout bookings. The fallback
  // keeps manually-created records deduplicated as well.
  const reference = order?.reference || `booking-${booking.id}`;

  // Paystack can deliver the same webhook more than once. The unique key plus
  // onConflictDoNothing makes both the website message and WhatsApp alert
  // idempotent, so the producer does not get duplicate confirmations.
  const [created] = await db
    .insert(notifications)
    .values({
      kind,
      title,
      body,
      reference,
      link: "/admin/bookings",
    })
    .onConflictDoNothing({ target: [notifications.kind, notifications.reference] })
    .returning({ id: notifications.id });

  if (!created) return;

  const settings = await getSettings();
  const to = settings.whatsappAlerts.trim();
  if (!to) return;
  const result = await sendWhatsAppAlert(to, `${title}\n${body}`);
  if (result.status !== "sent") {
    console.warn(`[whatsapp] booking alert (${phase}) ${result.status}: ${result.detail}`);
  }
}
