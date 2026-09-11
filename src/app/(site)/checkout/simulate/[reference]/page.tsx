import { notFound, redirect } from "next/navigation";
import { SimulatePayment } from "@/components/simulate-payment";
import { formatDate, formatTime12 } from "@/lib/format";
import { loadOrderByReference } from "@/lib/payments";
import { getPaymentMode } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export default async function SimulatePage({ params }: { params: Promise<{ reference: string }> }) {
  await ensureSeeded();
  const { reference } = await params;
  const bundle = await loadOrderByReference(reference);
  if (!bundle) notFound();
  const { order, items, booking } = bundle;
  if (order.status !== "pending" || getPaymentMode() !== "simulation") {
    redirect(`/orders/${encodeURIComponent(reference)}`);
  }

  const description =
    order.kind === "beat"
      ? items.map((i) => `${i.beatTitle} — ${i.licenseName}`).join(", ")
      : booking
        ? `${booking.serviceName} · ${formatDate(booking.bookingDate)} · ${formatTime12(booking.startTime)} (deposit)`
        : "Studio booking";

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <SimulatePayment
        reference={order.reference}
        total={order.total}
        currency={order.currency}
        network={order.network}
        phone={order.customerPhone}
        email={order.customerEmail}
        description={description}
      />
    </div>
  );
}
