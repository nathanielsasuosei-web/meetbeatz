import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, orders } from "@/db/schema";
import { Flash, PageHeader, StatusBadge } from "@/components/admin/flash";
import { formatDate, formatTime12, money, num } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { todayString } from "@/lib/slots";
import { resendOrderEmail, updateBookingStatus } from "../actions";
import { ensureSeeded } from "@/lib/seed";

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; view?: string }> }) {
  await ensureSeeded();
  const { msg, err, view } = await searchParams;
  const settings = await getSettings();
  const rows = await db
    .select({ booking: bookings, order: orders })
    .from(bookings)
    .leftJoin(orders, eq(bookings.orderId, orders.id))
    .orderBy(desc(bookings.bookingDate), desc(bookings.startTime))
    .limit(300);
  const today = todayString();
  const filtered = view === "past" ? rows.filter((r) => r.booking.bookingDate < today) : rows.filter((r) => r.booking.bookingDate >= today);
  const shown = view === "past" ? filtered : [...filtered].reverse();

  return (
    <>
      <PageHeader eyebrow="Studio" title="Bookings">
        <div className="flex gap-1">
          <Link href="/admin/bookings" className={`badge !px-3 !py-1.5 !text-xs ${view !== "past" ? "!border-acid !bg-acid !text-ink" : ""}`}>
            Upcoming
          </Link>
          <Link href="/admin/bookings?view=past" className={`badge !px-3 !py-1.5 !text-xs ${view === "past" ? "!border-acid !bg-acid !text-ink" : ""}`}>
            Past
          </Link>
        </div>
      </PageHeader>
      <Flash msg={msg} err={err} />

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>When</th>
              <th>Service</th>
              <th>Customer</th>
              <th>Money</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  No {view === "past" ? "past" : "upcoming"} bookings.
                </td>
              </tr>
            )}
            {shown.map(({ booking: b, order: o }) => {
              const balance = Math.max(0, num(b.sessionPrice) - num(b.amountPaid));
              return (
                <tr key={b.id}>
                  <td>
                    <p className="font-semibold">{formatDate(b.bookingDate)}</p>
                    <p className="text-xs text-muted">
                      {formatTime12(b.startTime)} – {formatTime12(b.endTime)} ({b.hours}h)
                    </p>
                  </td>
                  <td>
                    <p className="font-semibold">{b.serviceName}</p>
                    {b.notes && <p className="max-w-xs text-xs text-muted">“{b.notes}”</p>}
                  </td>
                  <td>
                    <p className="font-semibold">{b.customerName}</p>
                    <p className="text-[11px] text-muted">{b.customerEmail}</p>
                    <p className="text-[11px] text-muted">{b.customerPhone}</p>
                  </td>
                  <td className="text-xs">
                    <p>Session: {money(b.sessionPrice, settings.currency)}</p>
                    <p className="text-acid">Deposit paid: {money(b.amountPaid, settings.currency)}</p>
                    <p className="text-muted">Balance: {money(balance, settings.currency)}</p>
                    {o && (
                      <Link href={`/orders/${o.reference}`} className="font-mono text-[11px] text-muted hover:text-acid">
                        {o.reference}
                      </Link>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {b.status !== "confirmed" && b.status !== "completed" && (
                        <form action={updateBookingStatus.bind(null, b.id, "confirmed")}>
                          <button className="btn-ghost !px-3 !py-1.5 text-xs">Confirm</button>
                        </form>
                      )}
                      {b.status === "confirmed" && (
                        <form action={updateBookingStatus.bind(null, b.id, "completed")}>
                          <button className="btn-ghost !px-3 !py-1.5 text-xs">Mark done</button>
                        </form>
                      )}
                      {b.status !== "cancelled" && (
                        <form action={updateBookingStatus.bind(null, b.id, "cancelled")}>
                          <button className="btn-danger !px-3 !py-1.5 text-xs">Cancel</button>
                        </form>
                      )}
                      {o && o.status === "paid" && (
                        <form action={resendOrderEmail.bind(null, o.id)}>
                          <button className="btn-ghost !px-3 !py-1.5 text-xs">Resend email</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
