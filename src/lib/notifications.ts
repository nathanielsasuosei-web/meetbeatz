import { desc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, type Booking, type DistributionRelease, type Order, type RemoteSession } from "@/db/schema";
import { formatDate, formatTime12, money, num } from "./format";
import { SESSION_GOAL_LABELS, storeList } from "./release";
import { postSystemMessage } from "./messages";
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

/**
 * The distribution equivalent of `notifyBooking`: the producer hears about a
 * submission the moment it is created and again when the money lands, on the
 * site inbox and on WhatsApp.
 *
 * Same idempotence rule — Paystack can deliver a webhook twice, and the unique
 * (kind, reference) index plus `onConflictDoNothing` means the second one is
 * silently dropped rather than sending a duplicate alert.
 */
export async function notifyRelease(
  release: DistributionRelease,
  order: Order | null,
  phase: "submitted" | "paid",
): Promise<void> {
  const stores = storeList(release.stores).join(", ") || "no stores selected";
  const contact = [release.artistName, release.artistPhone, release.artistEmail].filter(Boolean).join(" · ");
  const customerWhatsApp = normalizeWhatsAppNumber(release.artistPhone);
  const reply = customerWhatsApp ? `Reply on WhatsApp: https://wa.me/${customerWhatsApp}` : "";
  const when = release.releaseDate ? `Requested release date ${formatDate(release.releaseDate)}` : "No release date requested";

  const { kind, title, body } =
    phase === "submitted"
      ? {
          kind: "release_submitted",
          title: `New distribution submission — ${release.artistName}`,
          body: [
            `New release submitted 📀`,
            `${release.releaseTitle} — ${release.planName} (${release.reference})`,
            `Artist: ${contact}`,
            `Stores: ${stores}`,
            when,
            release.explicit ? "Explicit content." : "",
            release.notes ? `Notes: ${release.notes}` : "",
            `Payment is pending — ref ${order?.reference ?? "—"}`,
            reply,
          ]
            .filter(Boolean)
            .join("\n"),
        }
      : {
          kind: "release_paid",
          title: `Release paid — ${release.releaseTitle}`,
          body: [
            `Payment received ✅ — ${release.releaseTitle} is ready to review`,
            `${release.planName} · ${release.reference}`,
            `Artist: ${contact}`,
            `Stores: ${stores}`,
            when,
            `Paid ${money(order?.subtotal ?? 0, order?.currency)} · ref ${order?.reference ?? "—"}`,
            reply,
          ]
            .filter(Boolean)
            .join("\n"),
        };

  const [created] = await db
    .insert(notifications)
    .values({ kind, title, body, reference: order?.reference || release.reference, link: "/admin/distribution" })
    .onConflictDoNothing({ target: [notifications.kind, notifications.reference] })
    .returning({ id: notifications.id });

  if (!created) return;

  const settings = await getSettings();
  const to = settings.whatsappAlerts.trim();
  if (!to) return;
  const result = await sendWhatsAppAlert(to, `${title}\n${body}`);
  if (result.status !== "sent") {
    console.warn(`[whatsapp] release alert (${phase}) ${result.status}: ${result.detail}`);
  }
}

/**
 * Remote recording sessions have two audiences, so this notifies both:
 *
 *   • `requested` → the producer, in the site inbox and on WhatsApp, exactly like
 *     a studio booking request, because somebody has to answer it;
 *   • `scheduled` / `updated` → the artist, as a system line in their support
 *     chat thread, which is the one channel they already watch (the chat widget
 *     polls it and badges unread replies).
 */
export async function notifyRemoteSession(
  session: RemoteSession,
  phase: "requested" | "scheduled" | "updated",
): Promise<void> {
  const goal = SESSION_GOAL_LABELS[session.goal] ?? session.goal;
  const when = [
    session.preferredDate ? formatDate(session.preferredDate) : "",
    session.preferredTime ? formatTime12(session.preferredTime) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (phase !== "requested") {
    if (!session.customerId) return;
    const statusLine =
      phase === "scheduled"
        ? `Your online session (${session.reference}) has been scheduled.`
        : `There is an update on your online session (${session.reference}).`;
    await postSystemMessage(
      session.customerId,
      [statusLine, when ? `Time: ${when}` : "", session.producerNote ? `From the producer: ${session.producerNote}` : ""]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  const contact = [session.artistName, session.artistPhone, session.artistEmail].filter(Boolean).join(" · ");
  const customerWhatsApp = normalizeWhatsAppNumber(session.artistPhone);
  const reply = customerWhatsApp ? `Reply on WhatsApp: https://wa.me/${customerWhatsApp}` : "";
  const title = `Online session request — ${session.artistName}`;
  const body = [
    `New online recording request 🎙️`,
    `${goal} — ${when || "no time suggested"}`,
    `Artist: ${contact}`,
    session.beatTitle ? `Beat: ${session.beatTitle}` : "",
    session.takePath ? `Take uploaded: ${session.takeName || "recording"} (${Math.round(session.takeSeconds)}s)` : "No take uploaded yet.",
    session.notes ? `Notes: ${session.notes}` : "",
    `Ref ${session.reference}`,
    reply,
  ]
    .filter(Boolean)
    .join("\n");

  const [created] = await db
    .insert(notifications)
    .values({ kind: "session_requested", title, body, reference: session.reference, link: "/admin/recording" })
    .onConflictDoNothing({ target: [notifications.kind, notifications.reference] })
    .returning({ id: notifications.id });

  if (!created) return;

  const settings = await getSettings();
  const to = settings.whatsappAlerts.trim();
  if (!to) return;
  const result = await sendWhatsAppAlert(to, `${title}\n${body}`);
  if (result.status !== "sent") {
    console.warn(`[whatsapp] session alert ${result.status}: ${result.detail}`);
  }
}
