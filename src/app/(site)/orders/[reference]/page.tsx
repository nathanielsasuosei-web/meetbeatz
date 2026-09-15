import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DownloadIcon } from "@/components/icons";
import {
  DELIVERABLE_LABELS,
  deliverableList,
  formatDate,
  formatDateTime,
  formatTime12,
  money,
  networkLabel,
  num,
} from "@/lib/format";
import { loadOrderByReference } from "@/lib/payments";
import { emailProvider, getPaymentMode, getSettings } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export const metadata: Metadata = { title: "Your order" };

export default async function OrderPage({ params }: { params: Promise<{ reference: string }> }) {
  await ensureSeeded();
  const { reference } = await params;
  const bundle = await loadOrderByReference(decodeURIComponent(reference));
  if (!bundle) notFound();
  const { order, items, licenses, booking } = bundle;
  const settings = await getSettings();
  const mode = getPaymentMode();
  const emailConfigured = emailProvider() !== "none";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {order.status === "pending" && (
        <div className="card p-8 text-center">
          <p className="eyebrow">Payment pending</p>
          <h1 className="display mt-3 text-4xl">Waiting for your payment</h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted">
            We have not received confirmation for <span className="font-mono text-cream">{order.reference}</span> yet. If you approved the
            prompt on your phone, tap the button below to check again.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {mode === "simulation" && order.paymentProvider === "simulation" ? (
              <Link href={`/checkout/simulate/${order.reference}`} className="btn-primary">
                Complete payment
              </Link>
            ) : (
              <Link href={`/checkout/verify?reference=${order.reference}`} className="btn-primary">
                I have paid — check again
              </Link>
            )}
            <Link href={order.kind === "beat" ? "/beats" : "/studio"} className="btn-ghost">
              Start over
            </Link>
          </div>
        </div>
      )}

      {(order.status === "failed" || order.status === "cancelled") && (
        <div className="card p-8 text-center">
          <p className="eyebrow text-danger!">Payment unsuccessful</p>
          <h1 className="display mt-3 text-4xl">That payment didn&apos;t go through</h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted">
            No money was taken for <span className="font-mono text-cream">{order.reference}</span>. Check your balance or try a different network.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={order.kind === "beat" ? "/beats" : "/studio"} className="btn-primary">
              Try again
            </Link>
          </div>
        </div>
      )}

      {order.status === "paid" && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Payment successful</p>
              <h1 className="display mt-3 text-4xl md:text-5xl">{order.kind === "beat" ? "Your beats are ready 🎧" : "Session confirmed 🎙️"}</h1>
              <p className="mt-3 text-sm text-muted">
                Order <span className="font-mono text-cream">{order.reference}</span> · Paid {formatDateTime(order.paidAt)} via {networkLabel(order.network)}
              </p>
            </div>
            <span className="badge-acid px-3! py-1.5!">PAID</span>
          </div>

          <div
            className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
              order.emailSentAt
                ? "border-ok/30 bg-ok/10 text-ok"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {order.emailSentAt ? (
              <>
                A copy of everything below was emailed to <strong>{order.customerEmail}</strong>. Check your spam folder if you don&apos;t see it.
              </>
            ) : emailConfigured ? (
              <>We could not send the confirmation email to {order.customerEmail}. Bookmark this page — your files and license are always available here.</>
            ) : (
              <>
                Email delivery is not configured yet, so save this page — it is your permanent access to your files and license. The producer can resend the
                email once email is set up.
              </>
            )}
          </div>

          {order.kind === "beat" && (
            <div className="mt-8 space-y-4">
              {licenses.map((lic) => (
                <div key={lic.id} className="card overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
                    <div>
                      <p className="eyebrow">{lic.licenseName}</p>
                      <p className="mt-1 text-2xl font-bold">{lic.beatTitle}</p>
                      <p className="mt-1 text-xs text-muted">
                        License key: <span className="font-mono text-cream">{lic.licenseKey}</span>
                      </p>
                    </div>
                    <Link href={`/license/${lic.licenseKey}`} className="btn-ghost">
                      View license certificate
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2 p-5">
                    {deliverableList(lic.deliverables).map((d) => (
                      <a key={d} href={`/api/download/${lic.downloadToken}?file=${d}`} className="btn-primary">
                        <DownloadIcon className="h-4 w-4" /> {DELIVERABLE_LABELS[d] ?? d.toUpperCase()}
                      </a>
                    ))}
                  </div>
                  <p className="border-t border-line bg-ink-2 px-5 py-3 text-xs text-muted">
                    Downloads are tied to your license — do not share these links. Credit as &quot;Prod. by {settings.siteName}&quot;.
                  </p>
                </div>
              ))}
            </div>
          )}

          {order.kind === "booking" && booking && (
            <div className="card mt-8 overflow-hidden">
              <div className="grid gap-6 p-6 md:grid-cols-2">
                <div>
                  <p className="eyebrow">{booking.serviceName}</p>
                  <p className="mt-2 text-3xl font-black">{formatDate(booking.bookingDate)}</p>
                  <p className="mt-1 text-lg">
                    {formatTime12(booking.startTime)} – {formatTime12(booking.endTime)}{" "}
                    <span className="text-muted">
                      ({booking.hours} hr{booking.hours > 1 ? "s" : ""})
                    </span>
                  </p>
                  <p className="mt-3 text-sm text-muted">{settings.location}</p>
                  {booking.notes && (
                    <p className="mt-3 text-sm text-muted">
                      <span className="font-semibold text-cream/80">Your notes:</span> {booking.notes}
                    </p>
                  )}
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between text-cream/80">
                    <dt>Session price</dt>
                    <dd>{money(booking.sessionPrice, order.currency)}</dd>
                  </div>
                  <div className="flex justify-between text-cream/80">
                    <dt>Deposit paid</dt>
                    <dd>{money(booking.amountPaid, order.currency)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2 font-black">
                    <dt>Balance due at studio</dt>
                    <dd className="text-acid">{money(Math.max(0, num(booking.sessionPrice) - num(booking.amountPaid)), order.currency)}</dd>
                  </div>
                </dl>
              </div>
              <p className="border-t border-line bg-ink-2 px-6 py-4 text-xs leading-relaxed text-muted">{settings.bookingPolicy}</p>
            </div>
          )}

          <div className="card mt-8 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Receipt</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-line/60">
                    <td className="py-2 text-cream/80">
                      {i.beatTitle} — {i.licenseName}
                    </td>
                    <td className="py-2 text-right">{money(i.price, order.currency)}</td>
                  </tr>
                ))}
                {order.kind === "booking" && (
                  <tr className="border-b border-line/60">
                    <td className="py-2 text-cream/80">Booking deposit</td>
                    <td className="py-2 text-right">{money(order.subtotal, order.currency)}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-2 text-muted">Service fee ({num(order.feePercent)}%)</td>
                  <td className="py-2 text-right text-muted">{money(order.fee, order.currency)}</td>
                </tr>
                <tr className="text-base font-black">
                  <td className="pt-3">Total paid</td>
                  <td className="pt-3 text-right text-acid">{money(order.total, order.currency)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 text-xs text-muted">
              Billed to {order.customerName} · {order.customerEmail}
              {order.customerPhone ? ` · ${order.customerPhone}` : ""}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/beats" className="btn-ghost">
              Browse more beats
            </Link>
            <Link href="/studio" className="btn-ghost">
              Book studio time
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
