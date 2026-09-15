import { finalizeOrder, loadOrderByReference, markOrderFailed } from "@/lib/payments";
import { getPaymentMode } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeeded();
  if (getPaymentMode() !== "simulation") {
    return Response.json({ error: "Simulated payments are disabled because Paystack is configured." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { reference?: string; outcome?: string };
  const reference = String(body.reference ?? "").trim();
  if (!reference) return Response.json({ error: "Missing reference" }, { status: 400 });

  const bundle = await loadOrderByReference(reference);
  if (!bundle) return Response.json({ error: "Order not found" }, { status: 404 });
  const url = `/orders/${encodeURIComponent(reference)}`;
  if (bundle.order.status !== "pending") return Response.json({ url });

  try {
    if (body.outcome === "success") {
      await finalizeOrder(reference, {
        provider: "simulation",
        providerData: {
          simulated: true,
          channel: bundle.order.network === "card" ? "card" : "mobile_money",
          gateway_response: "Approved (simulated)",
          paid_at: new Date().toISOString(),
          amount: Math.round(Number(bundle.order.total) * 100),
        },
      });
    } else {
      await markOrderFailed(reference, { simulated: true, gateway_response: "Declined by customer (simulated)" });
    }
    return Response.json({ url });
  } catch (err) {
    console.error("[checkout/simulate]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
