import { CheckoutError, createBeatCartOrder } from "@/lib/payments";
import { getCustomerSession, normalizeEmail } from "@/lib/customer-auth";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as {
      beatSlug?: string;
      licenseTypeId?: number | string;
      items?: Array<{ beatSlug?: string; licenseTypeId?: number | string }>;
      paymentMethod?: "ghana" | "global";
      promoCode?: string;
      agreedToTerms?: boolean;
      customer?: Record<string, string>;
    };
    const items = Array.isArray(body.items) && body.items.length > 0
      ? body.items.map((item) => ({ beatSlug: String(item.beatSlug ?? ""), licenseTypeId: Number(item.licenseTypeId) }))
      : [{ beatSlug: String(body.beatSlug ?? ""), licenseTypeId: Number(body.licenseTypeId) }];
    // A signed-in artist's purchase lands on their account page automatically.
    const session = await getCustomerSession();
    if (session && normalizeEmail(body.customer?.email ?? "") !== session.email) {
      throw new CheckoutError("Use your account email at checkout so this beat appears in your purchases.");
    }
    const result = await createBeatCartOrder({
      items,
      paymentMethod: body.paymentMethod,
      promoCode: body.promoCode,
      agreedToTerms: body.agreedToTerms,
      customer: body.customer ?? {},
      customerId: session?.id ?? null,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof CheckoutError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[checkout/beats]", err);
    const message = err instanceof Error ? err.message : "Could not start payment.";
    return Response.json({ error: `Could not start payment: ${message}` }, { status: 500 });
  }
}
