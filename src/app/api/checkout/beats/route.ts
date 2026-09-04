import { CheckoutError, createBeatOrder } from "@/lib/payments";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as {
      beatSlug?: string;
      licenseTypeId?: number | string;
      customer?: Record<string, string>;
    };
    const result = await createBeatOrder({
      beatSlug: String(body.beatSlug ?? ""),
      licenseTypeId: Number(body.licenseTypeId),
      customer: body.customer ?? {},
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof CheckoutError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[checkout/beat]", err);
    const message = err instanceof Error ? err.message : "Could not start payment.";
    return Response.json({ error: `Could not start payment: ${message}` }, { status: 500 });
  }
}
