import { CheckoutError, createDistributionOrder } from "@/lib/payments";
import { getCustomerSession, normalizeEmail } from "@/lib/customer-auth";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Starts payment for a distribution submission.
 *
 * Sign-in is required before this point (the artwork and master are uploaded
 * through `/api/uploads`, which is authenticated), so the release always has an
 * owner to appear against on the account page.
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const session = await getCustomerSession();
    if (!session) {
      return Response.json({ error: "Sign in to submit a release — your artwork and audio stay attached to your account." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      planId?: number | string;
      artistName?: string;
      releaseTitle?: string;
      genre?: string;
      releaseDate?: string;
      stores?: string[] | string;
      explicit?: boolean;
      isrc?: string;
      upc?: string;
      artworkPath?: string;
      audioPath?: string;
      notes?: string;
      customer?: Record<string, string>;
    };

    // The account email is the one the release is tracked against, so checkout
    // cannot quietly hand it to somebody else — same rule as a studio booking.
    if (normalizeEmail(body.customer?.email ?? "") !== session.email) {
      throw new CheckoutError("Use your account email at checkout so this release appears in your account.");
    }

    const result = await createDistributionOrder({
      release: {
        planId: Number(body.planId),
        artistName: String(body.artistName ?? ""),
        artistEmail: session.email,
        artistPhone: String(body.customer?.phone ?? ""),
        releaseTitle: String(body.releaseTitle ?? ""),
        genre: String(body.genre ?? ""),
        releaseDate: String(body.releaseDate ?? ""),
        stores: body.stores ?? [],
        explicit: body.explicit === true,
        isrc: String(body.isrc ?? ""),
        upc: String(body.upc ?? ""),
        artworkPath: String(body.artworkPath ?? ""),
        audioPath: String(body.audioPath ?? ""),
        notes: String(body.notes ?? ""),
      },
      customer: body.customer ?? {},
      customerId: session.id,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof CheckoutError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[checkout/distribution]", err);
    const message = err instanceof Error ? err.message : "Could not start payment.";
    return Response.json({ error: `Could not start payment: ${message}` }, { status: 500 });
  }
}
