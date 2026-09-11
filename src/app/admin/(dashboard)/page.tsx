import Link from "next/link";
import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import { db } from "@/db";
import { beats, bookings, licenses, orders } from "@/db/schema";
import { PageHeader, StatusBadge } from "@/components/admin/flash";
import { formatDate, formatDateTime, formatTime12, money, networkLabel } from "@/lib/format";
import { isPaystackConfigured } from "@/lib/paystack";
import { emailProvider, getSettings } from "@/lib/settings";
import { todayString } from "@/lib/slots";
import { ensureSeeded } from "@/lib/seed";

export default async function AdminDashboard() {
  await ensureSeeded();
  const settings = await getSettings();
  const [[rev], [beatCount], [licCount], [upcoming], recentOrders, upcomingBookings] = await Promise.all([
    db
      .select({ subtotal: sum(orders.subtotal), fee: sum(orders.fee), total: sum(orders.total), n: count() })
      .from(orders)
      .where(eq(orders.status, "paid")),
    db.select({ n: count() }).from(beats),
    db.select({ n: count() }).from(licenses),
    db
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.status, "confirmed"), gte(bookings.bookingDate, todayString()))),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
    db
      .select()
      .from(bookings)
      .where(and(eq(bookings.status, "confirmed"), gte(bookings.bookingDate, todayString())))
      .orderBy(bookings.bookingDate, bookings.startTime)
      .limit(6),
  ]);

  const checklist = [
    { ok: isPaystackConfigured(), label: "Paystack secret key added (PAYSTACK_SECRET_KEY)", href: "/admin/settings" },
    { ok: !!settings.paystackSubaccount, label: "Payout subaccount set — beat money goes to Meetbeatz, 10% fee stays separate", href: "/admin/settings" },
    { ok: emailProvider() !== "none", label: "Email delivery configured (SMTP or Resend)", href: "/admin/settings" },
    { ok: beatCount.n > 0, label: "First beat uploaded", href: "/admin/beats/new" },
  ];

  const stats = [
    { label: "Paid orders", value: String(rev.n ?? 0) },
    { label: "Earned by Meetbeatz", value: money(rev.subtotal ?? 0, settings.currency), accent: true },
    { label: "Fees collected (separate account)", value: money(rev.fee ?? 0, settings.currency) },
    { label: "Licenses issued", value: String(licCount.n) },
    { label: "Upcoming sessions", value: String(upcoming.n) },
    { label: "Beats in catalog", value: String(beatCount.n) },
  ];

  return (
    <>
      <PageHeader eyebrow="Overview" title="Dashboard">
        <Link href="/admin/beats/new" className="btn-primary">
          + Upload beat
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-xs uppercase tracking-wider text-muted">{s.label}</p>
            <p className={`display mt-2 text-3xl ${s.accent ? "text-acid" : ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-bold">Recent orders</h2>
            <Link href="/admin/orders" className="text-xs font-semibold text-acid">
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      No orders yet.
                    </td>
                  </tr>
                )}
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.reference}`} className="font-mono text-xs hover:text-acid">
                        {o.reference}
                      </Link>
                      <p className="text-[11px] text-muted">{formatDateTime(o.createdAt)}</p>
                    </td>
                    <td>
                      <p className="font-semibold">{o.customerName}</p>
                      <p className="text-[11px] text-muted">{networkLabel(o.network)}</p>
                    </td>
                    <td className="capitalize">{o.kind}</td>
                    <td className="font-semibold">{money(o.total, o.currency)}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-bold">Go-live checklist</h2>
            <ul className="mt-4 space-y-3">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black ${c.ok ? "bg-ok/20 text-ok" : "bg-white/10 text-muted"}`}>
                    {c.ok ? "✓" : "•"}
                  </span>
                  <Link href={c.href} className={c.ok ? "text-cream/80" : "text-cream hover:text-acid"}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-bold">Upcoming sessions</h2>
              <Link href="/admin/bookings" className="text-xs font-semibold text-acid">
                All bookings →
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {upcomingBookings.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">No upcoming sessions.</li>}
              {upcomingBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-semibold">
                      {b.serviceName} · {b.customerName}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(b.bookingDate)} · {formatTime12(b.startTime)}–{formatTime12(b.endTime)}
                    </p>
                  </div>
                  <span className="badge-acid">{b.hours}h</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
