import Link from "next/link";
import { Flash, PageHeader } from "@/components/admin/flash";
import { formatDateTime } from "@/lib/format";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const KIND: Record<string, { icon: string; label: string }> = {
  booking_request: { icon: "◷", label: "New booking" },
  booking_confirmed: { icon: "✓", label: "Deposit paid" },
};

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { msg, err } = await searchParams;
  // Opening the inbox reads everything — the nav badge clears itself, like an
  // email client. Items read during this visit still show a "new" marker.
  const items = await listNotifications(200);
  if (items.some((n) => !n.read)) {
    await markAllNotificationsRead().catch((e) => console.error("[notifications] failed to mark all read", e));
  }

  return (
    <>
      <PageHeader eyebrow="Producer inbox" title="Notifications">
        <p className="max-w-sm text-right text-xs text-muted">
          Studio booking alerts land here the moment they happen — and on your WhatsApp when it&apos;s connected.
        </p>
      </PageHeader>
      <Flash msg={msg} err={err} />

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-3xl">◈</p>
          <p className="mt-3 font-bold">Nothing yet</p>
          <p className="mt-1 text-sm text-muted">
            When a customer books a studio session you&apos;ll see it here instantly — the request, then the payment
            confirmation.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const kind = KIND[n.kind] ?? { icon: "◈", label: "Notification" };
            const link = n.link || "/admin/bookings";
            return (
              <article key={n.id} className={`card p-5 ${n.read ? "" : "border-acid/40"}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    aria-hidden
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${
                      n.kind === "booking_confirmed" ? "bg-acid/15 text-acid" : "bg-white/10 text-cream"
                    }`}
                  >
                    {kind.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">{n.title}</h2>
                      {!n.read && <span className="badge-acid">new</span>}
                      <span className="badge">{kind.label}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-cream/85">{n.body}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <time>{formatDateTime(n.createdAt)}</time>
                      {n.reference && <span className="font-mono">{n.reference}</span>}
                      <Link href={link} className="font-semibold text-acid hover:underline">
                        Open bookings →
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
