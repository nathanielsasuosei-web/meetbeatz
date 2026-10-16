"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckoutForm, type PaymentMethod } from "@/components/checkout-form";
import { PaymentMethodLogo } from "@/components/payment-brands";
import { CoverArt } from "@/components/beat-card";
import { useCart } from "@/components/cart/cart-provider";
import { DELIVERABLE_LABELS, deliverableList, money, round2 } from "@/lib/format";

function formatPromoExpiry(value: string | null): string {
  if (!value) return "No expiry date";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "No expiry date";
}

function PaymentChoice({ method }: { method: PaymentMethod }) {
  const isGhana = method === "ghana";
  return (
    <Link
      href={`/checkout/payment?method=${method}`}
      className="group relative block rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:-translate-y-0.5 hover:border-acid/60 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid/70"
      aria-label={`Continue with ${isGhana ? "Mobile Money Ghana" : "Global Payment Worldwide"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <PaymentMethodLogo method={method} compact />
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${isGhana ? "bg-acid text-ink" : "border border-amber-300/40 bg-amber-300/10 text-amber-200"}`}>
          {isGhana ? "SELECTED" : "Coming soon"}
        </span>
      </div>
      <div className="mt-5">
        <p className="text-base font-black">
          {isGhana ? <>Mobile Money <span className="text-acid">Ghana</span></> : <>Global Payment <span className="text-acid">Worldwide</span></>}
        </p>
        <p className="mt-1 max-w-lg text-sm text-muted">
          {isGhana ? "Card, Mobile Money, Bank Transfer, USSD" : "Card, Bank Transfer, Mobile Money and crypto payments across Africa with Bachs."}
        </p>
        {!isGhana && <p className="mt-3 text-xs font-semibold text-cream/70">Auto-converted · charged as <span className="text-cream">$30.00 USD</span> at the provider&apos;s live rate.</p>}
      </div>
      <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-acid transition group-hover:gap-2">
        {isGhana ? "Continue to customer details" : "View payment option"} <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

export function CartCheckout({
  feePercent,
  currency,
  account,
  stage = "method",
  initialPaymentMethod = "ghana",
}: {
  feePercent: number;
  currency: string;
  account?: { name: string; email: string } | null;
  stage?: "method" | "details";
  initialPaymentMethod?: PaymentMethod;
}) {
  const { items, ready, removeItem } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialPaymentMethod);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; percent: number; expiresAt: string | null } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    setPaymentMethod(initialPaymentMethod);
  }, [initialPaymentMethod]);

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((sum, item) => sum + item.price, 0));
    const discount = round2((subtotal * (appliedPromo?.percent ?? 0)) / 100);
    const discountedSubtotal = round2(subtotal - discount);
    const fee = round2((discountedSubtotal * feePercent) / 100);
    return { subtotal, discount, fee, total: round2(discountedSubtotal + fee) };
  }, [appliedPromo, feePercent, items]);

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    setPromoError(null);
    setAppliedPromo(null);
    if (!code) {
      setPromoError("Enter a promo code first.");
      return;
    }
    setPromoLoading(true);
    try {
      const response = await fetch("/api/promos/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => ({}))) as { code?: string; percent?: number; expiresAt?: string | null; error?: string };
      if (!response.ok || !data.code || !data.percent) {
        setPromoError(data.error ?? "That promo code is not valid.");
        return;
      }
      setAppliedPromo({ code: data.code, percent: data.percent, expiresAt: data.expiresAt ?? null });
    } catch {
      setPromoError("Could not check the promo code. Please try again.");
    } finally {
      setPromoLoading(false);
    }
  }

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
            {totals.discount > 0 && <div className="flex justify-between text-ok"><dt>Promo discount ({appliedPromo?.code})</dt><dd>−{money(totals.discount, currency)}</dd></div>}
            <div className="flex justify-between text-muted"><dt>Service fee ({feePercent}%)</dt><dd>{money(totals.fee, currency)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-black"><dt>Total</dt><dd className="text-acid">{money(totals.total, currency)}</dd></div>
          </dl>
          <Link href="/beats" className="mt-4 inline-block text-xs font-semibold text-muted hover:text-cream">← Add another beat</Link>
        </div>
      </aside>

      <section className="space-y-6">
        {stage === "method" ? (
          <section className="card p-6 md:p-8">
            <p className="eyebrow">02 · Payment Method</p>
            <h1 className="display mt-2 text-3xl md:text-4xl">Choose how you&apos;d like to pay.</h1>
            <p className="mt-3 max-w-xl text-sm text-muted">Select a payment method to continue to the secure customer details page.</p>
            <div className="mt-6 grid gap-3">
              <PaymentChoice method="ghana" />
              <PaymentChoice method="global" />
            </div>
          </section>
        ) : (
          <>
            <section className="card p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">02 · Payment Method</p>
                  <h1 className="display mt-2 text-3xl md:text-4xl">{paymentMethod === "ghana" ? "Mobile Money Ghana" : "Global Payment Worldwide"}</h1>
                  <p className="mt-2 text-sm text-muted">Your selected payment option</p>
                </div>
                <Link href="/cart" className="btn-ghost !px-4 !py-2 text-xs">Change method</Link>
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <PaymentMethodLogo method={paymentMethod} />
              </div>
              {paymentMethod === "global" && <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs leading-relaxed text-amber-100">{globalDisabledReason}</p>}
            </section>

            <div className="card p-5">
              <p className="eyebrow">Promo Code</p>
              <div className="mt-3 flex gap-2">
                <input
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void applyPromo(); } }}
                  className="field font-mono uppercase"
                  placeholder="Enter code"
                  aria-label="Promo code"
                />
                <button type="button" onClick={() => void applyPromo()} disabled={promoLoading} className="btn-ghost shrink-0 !px-5">
                  {promoLoading ? "Checking…" : "Apply"}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">Have a promo code? Enter it above.</p>
              {appliedPromo && (
                <p className="mt-2 text-xs font-semibold text-ok">
                  {appliedPromo.code} applied — {appliedPromo.percent}% off. Valid until {formatPromoExpiry(appliedPromo.expiresAt)}.
                </p>
              )}
              {promoError && <p className="mt-2 text-xs text-danger" role="alert">{promoError}</p>}
            </div>

            <section className="card p-6 md:p-8">
              <p className="eyebrow">03 · Your details</p>
              <h2 className="mt-2 text-xl font-bold">Secure checkout</h2>
              <p className="mt-1 text-sm text-muted">Your files and license are released only after the payment is confirmed.</p>
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <input id="license-agreement" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-acid" />
                <label htmlFor="license-agreement" className="text-xs leading-relaxed text-cream/80">
                  I have reviewed and agree to the selected license terms{" "}
                  <button type="button" onClick={() => setShowTerms(true)} className="font-bold text-acid underline underline-offset-2">(view terms)</button>{" "}
                  <span>for every beat and license listed above.</span>
                </label>
              </div>
              {showTerms && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="cart-terms-title">
                  <div className="glass-strong max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 md:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="eyebrow">License terms</p>
                        <h3 id="cart-terms-title" className="mt-2 text-2xl font-bold">Review every selected license</h3>
                      </div>
                      <button type="button" onClick={() => setShowTerms(false)} className="btn-ghost !px-3 !py-1.5" aria-label="Close license terms">×</button>
                    </div>
                    <div className="mt-6 space-y-4">
                      {items.map((item) => (
                        <article key={item.key} className="rounded-2xl border border-white/10 bg-ink/30 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-bold">{item.beatTitle}</p>
                              <p className="text-xs text-acid">{item.licenseName} license</p>
                            </div>
                            <Link href={`/beats/${item.beatSlug}`} className="text-xs font-semibold text-muted hover:text-cream">Open beat page →</Link>
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-cream/75">{item.terms || "The full terms for this license are available on the beat page."}</p>
                        </article>
                      ))}
                    </div>
                    <button type="button" onClick={() => { setAgreed(true); setShowTerms(false); }} className="btn-primary mt-6 w-full">I agree to these terms</button>
                  </div>
                </div>
              )}
              <div className="mt-6">
                <CheckoutForm
                  endpoint="/api/checkout/beats"
                  account={account}
                  paymentMethod={paymentMethod}
                  payload={{
                    items: items.map((item) => ({ beatSlug: item.beatSlug, licenseTypeId: item.licenseTypeId })),
                    promoCode: appliedPromo?.code ?? "",
                    agreedToTerms: agreed,
                  }}
                  buttonLabel={`Pay ${money(totals.total, currency)}`}
                  disabled={paymentMethod === "global" || !agreed}
                  disabledReason={paymentMethod === "global" ? globalDisabledReason : !agreed ? "Review and agree to the selected license terms before paying." : undefined}
                  showMtnApprovalHelp
                />
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  );
}
