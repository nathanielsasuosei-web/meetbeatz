import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { CoverArt } from "@/components/beat-card";
import { CheckoutForm } from "@/components/checkout-form";
import { getBeatBySlug, toCard } from "@/lib/catalog";
import { DELIVERABLE_LABELS, deliverableList, money, num } from "@/lib/format";
import { computeTotals } from "@/lib/payments";
import { getPaymentMode, getSettings } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ beat?: string; license?: string }> }) {
  await ensureSeeded();
  const { beat: slug, license } = await searchParams;
  if (!slug) redirect("/beats");
  const data = await getBeatBySlug(slug);
  if (!data || !data.beat.isPublished || data.beat.exclusiveSold) notFound();
  const selected = data.licenses.find((l) => l.id === Number(license)) ?? data.licenses[0];
  if (!selected) notFound();

  const settings = await getSettings();
  const totals = computeTotals(selected.price, num(settings.feePercent));
  const card = toCard(data.beat, selected.price);
  const mode = getPaymentMode();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Link href={`/beats/${data.beat.slug}`} className="text-sm font-semibold text-muted hover:text-cream">
        ← Back to {data.beat.title}
      </Link>
      <h1 className="display mt-4 text-4xl md:text-5xl">Checkout</h1>

      {mode === "simulation" && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong>Test mode:</strong> Paystack keys are not configured yet, so payments are simulated. Add <code>PAYSTACK_SECRET_KEY</code> to go
          live with real Mobile Money payments.
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <aside className="card h-fit overflow-hidden lg:sticky lg:top-24">
          <div className="flex gap-4 border-b border-line p-5">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-panel-2">
              <CoverArt beat={card} />
            </div>
            <div className="min-w-0">
              <p className="eyebrow">{selected.name}</p>
              <p className="mt-1 truncate text-xl font-bold">{data.beat.title}</p>
              <p className="text-xs text-muted">
                {[data.beat.genre, data.beat.bpm ? `${data.beat.bpm} BPM` : null, data.beat.musicalKey].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {deliverableList(selected.deliverables).map((d) => (
                  <span key={d} className="badge">
                    {DELIVERABLE_LABELS[d] ?? d}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <dl className="space-y-2 p-5 text-sm">
            <div className="flex justify-between text-cream/80">
              <dt>License price</dt>
              <dd>{money(totals.subtotal, settings.currency)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Service fee ({num(settings.feePercent)}%)</dt>
              <dd>{money(totals.fee, settings.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-black">
              <dt>Total to pay</dt>
              <dd className="text-acid">{money(totals.total, settings.currency)}</dd>
            </div>
          </dl>
          <div className="border-t border-line bg-ink-2 p-5 text-xs leading-relaxed text-muted">
            <p className="font-semibold text-cream/80">What you get instantly</p>
            <ul className="mt-2 space-y-1">
              <li>✓ Download links for every file in your license</li>
              <li>✓ Unique license key + printable certificate</li>
              <li>✓ Email receipt with everything above</li>
            </ul>
            <p className="mt-3">Change your license on the <Link href={`/beats/${data.beat.slug}`} className="text-acid">beat page</Link>.</p>
          </div>
        </aside>

        <section className="card p-6 md:p-8">
          <h2 className="text-xl font-bold">Your details</h2>
          <p className="mt-1 text-sm text-muted">Tell us where to send the beat, then approve the payment on your phone.</p>
          <div className="mt-6">
            <CheckoutForm
              endpoint="/api/checkout/beat"
              payload={{ beatSlug: data.beat.slug, licenseTypeId: selected.id }}
              buttonLabel={`Pay ${money(totals.total, settings.currency)}`}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
