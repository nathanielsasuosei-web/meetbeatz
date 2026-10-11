"use client";

import { useState } from "react";
import { NETWORKS } from "@/lib/format";

export type PaymentMethod = "ghana" | "global";

export function CheckoutForm({
  endpoint,
  payload,
  buttonLabel,
  disabled = false,
  disabledReason,
  account,
  paymentMethod = "ghana",
  onSuccess,
  requireAgreement = false,
  agreementLabel = "I have reviewed and agree to the selected license terms.",
  agreementTerms,
  showMtnApprovalHelp = false,
}: {
  endpoint: string;
  payload: Record<string, unknown>;
  buttonLabel: string;
  disabled?: boolean;
  disabledReason?: string;
  account?: { name: string; email: string } | null;
  paymentMethod?: PaymentMethod;
  onSuccess?: () => void;
  requireAgreement?: boolean;
  agreementLabel?: string;
  agreementTerms?: string;
  showMtnApprovalHelp?: boolean;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<string>("mtn");
  const [agreed, setAgreed] = useState(false);
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
        body: JSON.stringify({
          ...payload,
          paymentMethod,
          agreedToTerms: typeof payload.agreedToTerms === "boolean" ? payload.agreedToTerms : !requireAgreement || agreed,
          customer: { name, email, phone, network },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      onSuccess?.();
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
        <input id="co-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" readOnly={!!account} required />
        <p className="mt-1.5 text-xs text-muted">
          {account ? "This is your account email — your purchases appear in Your account." : "Your files, license and receipt are delivered to this address. Use your account email to see purchases there."}
        </p>
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
      {showMtnApprovalHelp && network === "mtn" && (
        <aside className="rounded-2xl border border-acid/25 bg-acid/[0.06] p-4" aria-labelledby="mtn-approval-help-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">MTN approval help</p>
              <h3 id="mtn-approval-help-title" className="mt-1 text-sm font-bold">No payment prompt? Open My Approvals.</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">Dial *170#, choose My Wallet, then My Approvals. Select the pending Meetbeatz payment and choose Approve.</p>
            </div>
            <span className="rounded-full border border-acid/30 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-acid">Audio guide</span>
          </div>
          <audio className="mt-4 h-10 w-full" controls preload="metadata" aria-label="How to approve a missing MTN Mobile Money payment prompt">
            <source src="/audio/mtn-momo-approval-help.mp3" type="audio/mpeg" />
            Your browser does not support audio. Dial star one seven zero hash, choose My Wallet, then My Approvals, select the pending payment, and choose Approve.
          </audio>
          <p className="mt-2 text-[11px] text-muted">Never share your MoMo PIN with anyone.</p>
        </aside>
      )}
      {requireAgreement && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <label className="flex items-start gap-3 text-xs leading-relaxed text-cream/80">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-acid" />
            <span>{agreementLabel}</span>
          </label>
          {agreementTerms && (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer font-semibold text-acid">View terms</summary>
              <p className="mt-2 whitespace-pre-line leading-relaxed">{agreementTerms}</p>
            </details>
          )}
        </div>
      )}
      {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      {disabled && disabledReason && <p className="text-xs text-muted">{disabledReason}</p>}
      <button type="submit" className="btn-primary w-full !py-3.5 text-base" disabled={loading || disabled || (requireAgreement && !agreed)}>
        {loading ? "Redirecting to secure payment…" : buttonLabel}
      </button>
      <p className="text-center text-[11px] text-muted">Secured by Paystack. We never see your PIN or card details.</p>
    </form>
  );
}
