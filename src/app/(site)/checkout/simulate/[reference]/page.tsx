import { notFound, redirect } from "next/navigation";
import { SimulatePayment } from "@/components/simulate-payment";
import { formatDate, formatTime12 } from "@/lib/format";
import { loadOrderByReference } from "@/lib/payments";
import { getPaymentMode } from "@/lib/settings";

export default async function SimulatePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const bundle = await loadOrderByReference(reference);
  if (!bundle) notFound();
  const { order, items, booking, release } = bundle;
  if (order.status !== "pending" || getPaymentMode() !== "simulation") {
    redirect(`/orders/${encodeURIComponent(reference)}`);
  }

  // Shown on the simulated payment prompt, so it has to say what is being paid
  // for — "Studio booking" on a release submission would look like a bug.
  const description =
    order.kind === "beat"
      ? items.map((i) => `${i.beatTitle} — ${i.licenseName}`).join(", ")
      : order.kind === "distribution" && release
        ? `${release.planName} distribution · ${release.releaseTitle} (${release.artistName})`
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
