import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "./actions";
import { DownloadIcon } from "@/components/icons";
import { loadAccountData } from "@/lib/account";
import { getCustomerSession } from "@/lib/customer-auth";
import { DELIVERABLE_LABELS, deliverableList, formatDate, formatDateTime, money, statusLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your account" };

const ORDER_STATUS_TONE: Record<string, string> = {
  paid: "badge-acid",
  pending: "badge",
};

export default async function AccountPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/account/login");
  const { orders, bookings } = await loadAccountData(session);
  const beatOrders = orders.filter((o) => o.order.kind === "beat");
  const bookingOrders = orders.filter((o) => o.order.kind === "booking");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">Hey, {session.name.split(" ")[0]} 👋</h1>
          <p className="mt-3 text-sm text-muted">
            Signed in as <span className="text-cream">{session.email}</span>
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost">
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Collection</p>
            <h2 className="mt-2 text-2xl font-bold">Your beats</h2>
          </div>
          <Link href="/beats" className="text-sm font-bold text-acid hover:underline">
            Browse more beats →
          </Link>
        </div>

        {beatOrders.length === 0 ? (
          <div className="card mt-5 p-10 text-center text-sm text-muted">
            No beats here yet. Anything you buy with this email shows up on this page — with its files and license
            certificate ready to download.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {beatOrders.map(({ order, items, licenses }) => (
              <div key={order.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge ${ORDER_STATUS_TONE[order.status] ?? "badge"}`}>{statusLabel(order.status)}</span>
                      <span className="font-mono text-xs text-muted">{order.reference}</span>
                      <span className="text-xs text-muted">{formatDate(order.paidAt ?? order.createdAt)}</span>
                    </div>
                    <div className="mt-3 space-y-1">
                      {items.map((item) => (
                        <p key={item.id} className="text-sm">
                          <span className="font-bold text-cream">{item.beatTitle}</span>
                          <span className="text-muted"> — {item.licenseName} license</span>
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-acid">{money(order.total, order.currency)}</p>
                    <Link href={`/orders/${order.reference}`} className="mt-1 inline-block text-xs font-semibold text-muted hover:text-cream">
                      View order →
                    </Link>
                  </div>
                </div>

                {order.status === "paid" && licenses.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    {licenses.map((license) =>
                      deliverableList(license.deliverables).map((file) => (
                        <a
                          key={`${license.id}-${file}`}
                          href={`/api/download/${license.downloadToken}?file=${file}`}
                          className="btn-ghost !px-3.5 !py-2 text-xs"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          {DELIVERABLE_LABELS[file] ?? file.toUpperCase()}
                        </a>
                      )),
                    )}
                    {licenses.map((license) => (
                      <Link key={`cert-${license.id}`} href={`/license/${license.licenseKey}`} className="btn-ghost !px-3.5 !py-2 text-xs">
                        License certificate
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Studio</p>
            <h2 className="mt-2 text-2xl font-bold">Your sessions</h2>
          </div>
          <Link href="/studio" className="text-sm font-bold text-acid hover:underline">
            Book a session →
          </Link>
        </div>
        {bookings.length === 0 ? (
          <div className="card mt-5 p-10 text-center text-sm text-muted">
            No studio sessions yet — book recording, mixing or mastering time and it will appear here.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-bold">{b.serviceName}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(b.bookingDate)} · {b.startTime}–{b.endTime} ({b.hours}h)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge">{statusLabel(b.status)}</span>
                  {b.orderId && bookingOrders.find((o) => o.order.id === b.orderId) && (
                    <Link
                      href={`/orders/${bookingOrders.find((o) => o.order.id === b.orderId)!.order.reference}`}
                      className="text-xs font-semibold text-muted hover:text-cream"
                    >
                      View order →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-xl font-bold">Questions? Chat with us 💬</h2>
            <p className="mt-1 text-sm text-muted">
              Use the chat bubble in the corner — it goes straight to Meetbeatz and the replies land right there.
            </p>
          </div>
          <Link href="/beats" className="btn-primary">
            Keep browsing
          </Link>
        </div>
      </section>

      {bookingOrders.length > 0 && (
        <p className="mt-8 text-xs text-muted">
          Booking payments are also listed in Your sessions above ·{" "}
          {bookingOrders.map((o, i) => (
            <span key={o.order.id}>
              {i > 0 && " · "}
              <Link href={`/orders/${o.order.reference}`} className="hover:text-cream">
                {o.order.reference}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
