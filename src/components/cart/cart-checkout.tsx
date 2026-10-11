"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckoutForm, type PaymentMethod } from "@/components/checkout-form";
import { CoverArt } from "@/components/beat-card";
import { useCart } from "@/components/cart/cart-provider";
import { DELIVERABLE_LABELS, deliverableList, money, round2 } from "@/lib/format";

export function CartCheckout({
  feePercent,
  currency,
  account,
}: {
  feePercent: number;
  currency: string;
  account?: { name: string; email: string } | null;
}) {
  const { items, ready, removeItem } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ghana");

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((sum, item) => sum + item.price, 0));
    const fee = round2((subtotal * feePercent) / 100);
    return { subtotal, fee, total: round2(subtotal + fee) };
  }, [feePercent, items]);

  if (!ready) {
    return <div className="card animate-pulse p-10 text-center text-sm text-muted">Opening your cart…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-4xl" aria-hidden>🛒</p>
        <h2 className="mt-4 text-xl font-bold">Your cart is empty</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">Choose a beat and license first. It will stay here while you browse more beats.</p>
        <Link href="/beats" className="btn-primary mt-6">Browse beats</Link>
      </div>
    );
  }

  const globalDisabledReason = "Global Payment Worldwide is being connected. Choose Mobile Money Ghana to continue with the live checkout.";

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="card h-fit overflow-hidden lg:sticky lg:top-24">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">01 · Your cart</p>
            <h2 className="mt-1 text-xl font-bold">Selected beats</h2>
          </div>
          <span className="badge-acid">{items.length} item{items.length === 1 ? "" : "s"}</span>
        </div>
        <div className="divide-y divide-line">
          {items.map((item) => (
            <article key={item.key} className="flex gap-3 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-panel-2">
                <CoverArt beat={{ cover: item.cover, title: item.beatTitle }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{item.beatTitle}</p>
                <p className="mt-0.5 text-xs text-muted">{item.licenseName} license</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {deliverableList(item.deliverables).map((file) => (
                    <span key={file} className="badge !px-2 !py-0 text-[10px]">{DELIVERABLE_LABELS[file] ?? file.toUpperCase()}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-acid">{money(item.price, currency)}</p>
                <button type="button" onClick={() => removeItem(item.key)} className="mt-2 text-[11px] font-semibold text-muted hover:text-danger">Remove</button>
              </div>
            </article>
          ))}
        </div>
        <div className="border-t border-line bg-ink-2 p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between text-cream/80"><dt>Beat licenses</dt><dd>{money(totals.subtotal, currency)}</dd></div>
            <div className="flex justify-between text-muted"><dt>Service fee ({feePercent}%)</dt><dd>{money(totals.fee, currency)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-black"><dt>Total</dt><dd className="text-acid">{money(totals.total, currency)}</dd></div>
          </dl>
          <Link href="/beats" className="mt-4 inline-block text-xs font-semibold text-muted hover:text-cream">← Add another beat</Link>
        </div>
      </aside>

      <section className="space-y-6">
        <div className="card p-6 md:p-8">
          <div>
            <p className="eyebrow">02 · Payment Method</p>
            <h1 className="display mt-2 text-3xl md:text-4xl">Choose how you&apos;d like to pay.</h1>
          </div>
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              aria-pressed={paymentMethod === "ghana"}
              onClick={() => setPaymentMethod("ghana")}
              className={`relative rounded-2xl border p-4 text-left transition ${paymentMethod === "ghana" ? "glass-acid border-acid/60" : "glass hover:border-white/25"}`}
            >
              {paymentMethod === "ghana" && <span className="absolute right-4 top-4 rounded-full bg-acid px-2 py-1 text-[10px] font-black text-ink">SELECTED</span>}
              <p className="pr-20 text-base font-black">Mobile Money <span className="text-acid">Ghana</span></p>
              <p className="mt-1 text-sm text-muted">Card, Mobile Money, Bank Transfer, USSD</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-wider text-cream/70">
                <span className="rounded bg-white/10 px-2 py-1">VISA</span>
                <span className="rounded bg-white/10 px-2 py-1">MTN</span>
                <span className="rounded bg-white/10 px-2 py-1">Telecel</span>
                <span className="rounded bg-white/10 px-2 py-1">AT Money</span>
              </div>
            </button>

            <button
              type="button"
              aria-pressed={paymentMethod === "global"}
              onClick={() => setPaymentMethod("global")}
              className={`relative rounded-2xl border p-4 text-left transition ${paymentMethod === "global" ? "glass-acid border-acid/60" : "glass hover:border-white/25"}`}
            >
              <span className="absolute right-4 top-4 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">Coming soon</span>
              <p className="pr-24 text-base font-black">Global Payment <span className="text-acid">Worldwide</span></p>
              <p className="mt-1 max-w-lg text-sm text-muted">Card, Bank Transfer, Mobile Money and crypto payments across Africa with Bachs.</p>
              <p className="mt-3 text-xs font-semibold text-cream/70">Auto-converted · charged as <span className="text-cream">$30.00 USD</span> at the provider&apos;s live rate.</p>
            </button>
          </div>
          {paymentMethod === "global" && <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-relaxed text-amber-100">{globalDisabledReason}</p>}
        </div>

        <section className="card p-6 md:p-8">
          <p className="eyebrow">03 · Your details</p>
          <h2 className="mt-2 text-xl font-bold">Secure checkout</h2>
          <p className="mt-1 text-sm text-muted">Your files and license are released only after the payment is confirmed.</p>
          <div className="mt-6">
            <CheckoutForm
              endpoint="/api/checkout/beats"
              account={account}
              paymentMethod={paymentMethod}
              payload={{ items: items.map((item) => ({ beatSlug: item.beatSlug, licenseTypeId: item.licenseTypeId })) }}
              buttonLabel={`Pay ${money(totals.total, currency)}`}
              disabled={paymentMethod === "global"}
              disabledReason={paymentMethod === "global" ? globalDisabledReason : undefined}
            />
          </div>
        </section>
      </section>
    </div>
  );
}
