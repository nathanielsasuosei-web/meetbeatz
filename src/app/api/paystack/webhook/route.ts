import { verifyWebhookSignature } from "@/lib/paystack";
import { markOrderFailed, verifyPaystackAndFinalize } from "@/lib/payments";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook. Configure `https://<your-domain>/api/paystack/webhook` in the
 * Paystack dashboard so orders are fulfilled even if the customer closes the browser.
 */
export async function POST(req: Request) {
  await ensureSeeded();
  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string; status?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const reference = event.data?.reference;
  try {
    if (event.event === "charge.success" && reference) {
      // Re-verify with Paystack before fulfilling — never trust the payload alone.
      await verifyPaystackAndFinalize(reference);
    } else if (event.event === "charge.failed" && reference) {
      await markOrderFailed(reference, { webhook: event.event, status: event.data?.status });
    }
  } catch (err) {
    console.error("[paystack webhook]", err);
    return new Response("Processing error", { status: 500 });
  }
  return Response.json({ received: true });
}
