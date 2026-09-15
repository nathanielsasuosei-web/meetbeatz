import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { Flash, PageHeader, StatusBadge } from "@/components/admin/flash";
import { formatDateTime, money, networkLabel } from "@/lib/format";
import { resendOrderEmail } from "../actions";
import { ensureSeeded } from "@/lib/seed";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; status?: string }> }) {
  await ensureSeeded();
  const { msg, err, status } = await searchParams;
  const [rows, items] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(status ? eq(orders.status, status) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(200),
    db.select().from(orderItems).orderBy(asc(orderItems.id)),
  ]);
  const itemMap = new Map<number, typeof items>();
  for (const it of items) itemMap.set(it.orderId, [...(itemMap.get(it.orderId) ?? []), it]);
  const paid = rows.filter((o) => o.status === "paid");
  const sumOf = (key: "subtotal" | "fee" | "total") => paid.reduce((acc, o) => acc + Number(o[key]), 0);
  const currency = rows[0]?.currency ?? "GHS";

  return (
    <>
      <PageHeader eyebrow="Sales" title="Orders">
        <div className="flex gap-1">
          {[
            ["", "All"],
            ["paid", "Paid"],
            ["pending", "Pending"],
            ["failed", "Failed"],
          ].map(([v, label]) => (
            <Link key={v} href={v ? `/admin/orders?status=${v}` : "/admin/orders"} className={`badge !px-3 !py-1.5 !text-xs ${status === v || (!status && !v) ? "!border-acid !bg-acid !text-ink" : ""}`}>
              {label}
            </Link>
          ))}
        </div>
      </PageHeader>
      <Flash msg={msg} err={err} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">To Meetbeatz (shown)</p>
          <p className="display mt-1 text-2xl text-acid">{money(sumOf("subtotal"), currency)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Fees → separate account</p>
          <p className="display mt-1 text-2xl">{money(sumOf("fee"), currency)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Customers paid</p>
          <p className="display mt-1 text-2xl">{money(sumOf("total"), currency)}</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Split</th>
              <th>Status</th>
              <th>Email</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted">
                  No orders found.
                </td>
              </tr>
            )}
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/orders/${o.reference}`} className="font-mono text-xs hover:text-acid">
                    {o.reference}
                  </Link>
                  <p className="text-[11px] text-muted">{formatDateTime(o.createdAt)}</p>
                  <p className="text-[11px] capitalize text-muted">
                    {o.kind} · {o.paymentProvider}
                  </p>
                </td>
                <td>
                  <p className="font-semibold">{o.customerName}</p>
                  <p className="text-[11px] text-muted">{o.customerEmail}</p>
                  <p className="text-[11px] text-muted">
                    {o.customerPhone} · {networkLabel(o.network)}
                  </p>
                </td>
                <td className="text-xs">
                  {o.kind === "booking" ? (
                    <span>Studio deposit</span>
                  ) : (
                    (itemMap.get(o.id) ?? []).map((it) => (
                      <p key={it.id}>
                        {it.beatTitle} <span className="text-muted">— {it.licenseName}</span>
                      </p>
                    ))
                  )}
                </td>
                <td className="text-xs">
                  <p>
                    Meetbeatz: <span className="font-semibold text-acid">{money(o.subtotal, o.currency)}</span>
                  </p>
                  <p className="text-muted">
                    Fee ({Number(o.feePercent)}%): {money(o.fee, o.currency)}
                  </p>
                  <p className="font-semibold">Total: {money(o.total, o.currency)}</p>
                </td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td className="text-xs">
                  {o.status !== "paid" ? <span className="text-muted">—</span> : o.emailSentAt ? <span className="text-ok">Sent {formatDateTime(o.emailSentAt)}</span> : <span className="text-amber-300">Not sent</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-1.5">
                    <Link href={`/orders/${o.reference}`} className="btn-ghost !px-3 !py-1.5 text-xs">
                      View
                    </Link>
                    {o.status === "paid" && (
                      <form action={resendOrderEmail.bind(null, o.id)}>
                        <button className="btn-ghost !px-3 !py-1.5 text-xs">Resend email</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
