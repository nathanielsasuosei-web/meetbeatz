"use client";

import { useState } from "react";
import { NETWORKS } from "@/lib/format";

export function CheckoutForm({
  endpoint,
  payload,
  buttonLabel,
  disabled = false,
  disabledReason,
}: {
  endpoint: string;
  payload: Record<string, unknown>;
  buttonLabel: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<string>("mtn");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, customer: { name, email, phone, network } }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="label" htmlFor="co-name">Full name</label>
        <input id="co-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kwame Mensah" required minLength={2} />
      </div>
      <div>
        <label className="label" htmlFor="co-email">Email address</label>
        <input id="co-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <p className="mt-1.5 text-xs text-muted">Your files, license and receipt are delivered to this address.</p>
      </div>
      <div>
        <span className="label">Pay with</span>
        <div className="grid grid-cols-2 gap-2">
          {NETWORKS.map((n) => (
            <button
              key={n.value}
              type="button"
              onClick={() => setNetwork(n.value)}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${network === n.value ? "border-acid bg-acid/10 text-cream" : "border-line bg-ink-2 text-muted hover:border-line-2"}`}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
      {network !== "card" && (
        <div>
          <label className="label" htmlFor="co-phone">Mobile money number</label>
          <input id="co-phone" type="tel" inputMode="tel" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 123 4567" required />
          <p className="mt-1.5 text-xs text-muted">You will receive a payment prompt on this number. Approve it with your PIN.</p>
        </div>
      )}
      {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      {disabled && disabledReason && <p className="text-xs text-muted">{disabledReason}</p>}
      <button type="submit" className="btn-primary w-full !py-3.5 text-base" disabled={loading || disabled}>
        {loading ? "Redirecting to secure payment…" : buttonLabel}
      </button>
      <p className="text-center text-[11px] text-muted">Secured by Paystack. We never see your PIN or card details.</p>
    </form>
  );
}
