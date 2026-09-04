"use client";

import { useState } from "react";
import { money, networkLabel } from "@/lib/format";

export function SimulatePayment({
  reference,
  total,
  currency,
  network,
  phone,
  email,
  description,
}: {
  reference: string;
  total: string;
  currency: string;
  network: string;
  phone: string;
  email: string;
  description: string;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"success" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(outcome: "success" | "failed") {
    setBusy(outcome);
    setError(null);
    try {
      const res = await fetch("/api/checkout/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, outcome }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not complete the simulated payment.");
        setBusy(null);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Network error. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-3xl border border-line bg-panel p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-cream">Secure Checkout</p>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">Test mode</span>
        </div>
        <p className="mt-1 text-xs text-muted">{email}</p>

        <div className="mt-6 rounded-2xl bg-ink-2 p-5 text-center">
          <p className="text-xs uppercase tracking-wider text-muted">Amount</p>
          <p className="display mt-1 text-4xl">{money(total, currency)}</p>
          <p className="mt-2 text-xs text-muted">{description}</p>
        </div>

        <div className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Channel</span>
            <span className="font-semibold">{networkLabel(network)}</span>
          </div>
          {network !== "card" && (
            <div className="flex justify-between">
              <span className="text-muted">Number</span>
              <span className="font-semibold">{phone}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">Reference</span>
            <span className="font-mono text-xs">{reference}</span>
          </div>
        </div>

        <div className="mt-6">
          <label className="label" htmlFor="sim-pin">
            {network === "card" ? "Card OTP (any 4 digits)" : "Approve prompt — enter MoMo PIN (any 4 digits)"}
          </label>
          <input
            id="sim-pin"
            className="field text-center font-mono text-2xl tracking-[0.6em]"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
          />
        </div>

        {error && <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

        <button type="button" className="btn-primary mt-5 w-full !py-3.5" disabled={pin.length !== 4 || busy !== null} onClick={() => submit("success")}>
          {busy === "success" ? "Confirming payment…" : `Approve ${money(total, currency)}`}
        </button>
        <button type="button" className="btn-ghost mt-2 w-full" disabled={busy !== null} onClick={() => submit("failed")}>
          {busy === "failed" ? "Cancelling…" : "Decline payment"}
        </button>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          This screen simulates the Paystack Mobile Money prompt. Once <code>PAYSTACK_SECRET_KEY</code> is set, customers are redirected to
          Paystack&apos;s real checkout instead.
        </p>
      </div>
    </div>
  );
}
