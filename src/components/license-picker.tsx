"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BeatLicenseOption } from "@/lib/catalog";
import { DELIVERABLE_LABELS, deliverableList, money, round2 } from "@/lib/format";
import { CheckIcon } from "./icons";

export function LicensePicker({
  beatSlug,
  licenses,
  feePercent,
  currency,
}: {
  beatSlug: string;
  licenses: BeatLicenseOption[];
  feePercent: number;
  currency: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(licenses[0]?.id ?? null);
  const [showTerms, setShowTerms] = useState(false);
  const selected = useMemo(() => licenses.find((l) => l.id === selectedId) ?? null, [licenses, selectedId]);

  if (licenses.length === 0) {
    return <div className="card p-6 text-sm text-muted">Licenses for this beat are not available yet. Check back soon.</div>;
  }

  const fee = selected ? round2((selected.price * feePercent) / 100) : 0;
  const total = selected ? round2(selected.price + fee) : 0;

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
              className={`relative rounded-2xl border p-4 text-left transition ${active ? "border-acid bg-acid/5" : "border-line bg-panel hover:border-line-2"}`}
            >
              {active && (
                <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-acid text-ink">
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
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-cream/80">
              <dt>{selected.name}</dt>
              <dd>{money(selected.price, currency)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Service fee ({feePercent}%)</dt>
              <dd>{money(fee, currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-black">
              <dt>Total</dt>
              <dd className="text-acid">{money(total, currency)}</dd>
            </div>
          </dl>
          <Link href={`/checkout?beat=${encodeURIComponent(beatSlug)}&license=${selected.id}`} className="btn-primary mt-5 w-full !py-3.5 text-base">
            Continue to payment
          </Link>
          <p className="mt-3 text-center text-xs text-muted">MTN MoMo · Telecel Cash · AirtelTigo Money · Cards</p>
          <button type="button" onClick={() => setShowTerms((s) => !s)} className="mt-4 text-xs font-semibold text-acid hover:underline">
            {showTerms ? "Hide license terms" : "Read license terms"}
          </button>
          {showTerms && <p className="mt-2 text-xs leading-relaxed text-muted">{selected.terms}</p>}
        </div>
      )}
    </div>
  );
}
