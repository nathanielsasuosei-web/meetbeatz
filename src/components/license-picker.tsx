"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { BeatLicenseOption } from "@/lib/catalog";
import { DELIVERABLE_LABELS, deliverableList, money, round2 } from "@/lib/format";
import { CheckIcon } from "./icons";
import { useCart } from "./cart/cart-provider";
import type { CartItem } from "@/lib/cart";

export function LicensePicker({
  beatSlug,
  beatTitle,
  cover,
  licenses,
  feePercent,
  currency,
}: {
  beatSlug: string;
  beatTitle: string;
  cover: string | null;
  licenses: BeatLicenseOption[];
  feePercent: number;
  currency: string;
}) {
  const router = useRouter();
  const { addItem, hasItem } = useCart();
  const [selectedId, setSelectedId] = useState<number | null>(licenses[0]?.id ?? null);
  const [showTerms, setShowTerms] = useState(false);
  const selected = useMemo(() => licenses.find((l) => l.id === selectedId) ?? null, [licenses, selectedId]);

  if (licenses.length === 0) {
    return <div className="card p-6 text-sm text-muted">Licenses for this beat are not available yet. Check back soon.</div>;
  }

  const fee = selected ? round2((selected.price * feePercent) / 100) : 0;
  const total = selected ? round2(selected.price + fee) : 0;
  const alreadyInCart = selected ? hasItem(beatSlug, selected.id) : false;

  function addSelectedToCart() {
    if (!selected) return;
    const item: CartItem = {
      key: `${beatSlug}:${selected.id}`,
      beatSlug,
      beatTitle,
      licenseTypeId: selected.id,
      licenseName: selected.name,
      price: selected.price,
      currency,
      cover,
      deliverables: selected.deliverables,
    };
    addItem(item);
    router.push("/cart");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {licenses.map((lic) => {
          const active = lic.id === selectedId;
          return (
            <button
              key={lic.id}
              type="button"
              onClick={() => setSelectedId(lic.id)}
              className={`relative rounded-2xl p-4 text-left transition ${
                active
                  ? "glass-acid"
                  : "glass hover:border-white/25"
              }`}
            >
              {active && (
                <span className="absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-full bg-acid text-ink shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset,0_4px_12px_-2px_rgba(198,241,53,0.5)]">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              )}
              <p className="pr-8 text-sm font-bold">{lic.name}</p>
              <p className="mt-0.5 text-xs text-muted">{lic.tagline}</p>
              <p className="mt-3 text-lg font-black text-acid">{money(lic.price, currency)}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {deliverableList(lic.deliverables).map((d) => (
                  <span key={d} className="badge">
                    {DELIVERABLE_LABELS[d] ?? d.toUpperCase()}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="card p-5">
          <p className="text-sm text-cream/80">{selected.description}</p>
          <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between text-cream/80">
              <dt>{selected.name}</dt>
              <dd>{money(selected.price, currency)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Service fee ({feePercent}%)</dt>
              <dd>{money(fee, currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-2 text-base font-black">
              <dt>Total</dt>
              <dd className="text-acid">{money(total, currency)}</dd>
            </div>
          </dl>
          <button type="button" onClick={addSelectedToCart} className="btn-primary mt-5 w-full !py-3.5 text-base">
            {alreadyInCart ? "Update cart & review" : "Add to cart"}
          </button>
          <p className="mt-3 text-center text-xs text-muted">Add the beat to your cart, then choose your payment method.</p>
          <button type="button" onClick={() => setShowTerms((s) => !s)} className="mt-4 text-xs font-semibold text-acid hover:underline">
            {showTerms ? "Hide license terms" : "Read license terms"}
          </button>
          {showTerms && <p className="mt-2 text-xs leading-relaxed text-muted">{selected.terms}</p>}
        </div>
      )}
    </div>
  );
}
