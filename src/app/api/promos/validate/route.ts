import { resolvePromoCode } from "@/lib/promos";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Validates the producer-configured promo without exposing the code publicly. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const requested = String(body.code ?? "").trim().toUpperCase();
  const configured = requested ? await resolvePromoCode(requested, await getSettings()) : null;

  if (!configured) {
    return Response.json({ error: "That promo code is not valid or has expired." }, { status: 400 });
  }
  return Response.json({ code: configured.code, percent: configured.percent, expiresAt: configured.expiresAt });
}
