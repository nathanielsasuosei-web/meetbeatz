import { CheckoutError, createBookingOrder } from "@/lib/payments";
import { getCustomerSession } from "@/lib/customer-auth";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as {
      serviceId?: number | string;
      date?: string;
      startTime?: string;
      hours?: number | string;
      notes?: string;
      customer?: Record<string, string>;
    };
    // A signed-in artist's booking lands on their account page automatically.
    const session = await getCustomerSession();
    const result = await createBookingOrder({
      serviceId: Number(body.serviceId),
      date: String(body.date ?? ""),
      startTime: String(body.startTime ?? ""),
      hours: Number(body.hours),
      notes: String(body.notes ?? ""),
      customer: body.customer ?? {},
      customerId: session?.id ?? null,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof CheckoutError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[checkout/booking]", err);
    const message = err instanceof Error ? err.message : "Could not start payment.";
    return Response.json({ error: `Could not start payment: ${message}` }, { status: 500 });
  }
}
