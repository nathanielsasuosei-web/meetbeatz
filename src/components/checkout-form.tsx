"use client";

import { useState } from "react";
import { EMAIL_ERROR, isValidEmail } from "@/lib/email-address";
import { NETWORKS } from "@/lib/format";

export type PaymentMethod = "ghana" | "global";

/**
 * Mobile Money prompts do not always arrive on the customer's phone, and MTN
 * keeps the pending request in *170# → My Approvals. This card shows those
 * steps next to the form after the payment has been started.
 *
 * It deliberately does NOT block payment: Paystack is opened as soon as the
 * order is created, every button here is enabled from the start, and there is
 * no audio (or anything else) the customer has to sit through first.
 */
function MtnApprovalHelp({
  opened,
  onOpen,
  onOpenHere,
  onDismiss,
}: {
  opened: boolean;
  onOpen: () => void;
  onOpenHere: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-labelledby="mtn-approval-help-title"
      className="mt-6 rounded-2xl border border-acid/25 bg-acid/[0.06] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Approve the prompt</p>
          <h2 id="mtn-approval-help-title" className="mt-1 text-lg font-bold">
            No MTN prompt? Open My Approvals.
          </h2>
        </div>
        <button type="button" onClick={onDismiss} className="btn-ghost !px-2.5 !py-1" aria-label="Hide MTN approval help">
          ×
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        Your payment request is ready. If the approval prompt does not pop up on your phone, approve it yourself — it stays
        pending for a few minutes.
      </p>

      <ol className="mt-4 grid gap-2 text-sm text-cream/85 sm:grid-cols-2">
        <li>
          <span className="mr-2 inline-flex min-w-6 justify-center rounded bg-acid px-1.5 py-0.5 font-black text-ink">1</span>
          Dial <code>*170#</code>
        </li>
        <li>
          <span className="mr-2 inline-flex min-w-6 justify-center rounded bg-acid px-1.5 py-0.5 font-black text-ink">2</span>
          Press <strong>6</strong> for My Wallet
        </li>
        <li>
          <span className="mr-2 inline-flex min-w-6 justify-center rounded bg-acid px-1.5 py-0.5 font-black text-ink">3</span>
          Press <strong>3</strong> for My Approvals
        </li>
        <li>
          <span className="mr-2 inline-flex min-w-6 justify-center rounded bg-acid px-1.5 py-0.5 font-black text-ink">4</span>
          Press <strong>1</strong> to select My Approvals
        </li>
        <li>
          <span className="mr-2 inline-flex min-w-6 justify-center rounded bg-acid px-1.5 py-0.5 font-black text-ink">5</span>
          Enter your MoMo PIN
        </li>
        <li>
          <span className="mr-2 inline-flex min-w-6 justify-center rounded bg-acid px-1.5 py-0.5 font-black text-ink">6</span>
          Pick the pending payment and choose Approve
        </li>
      </ol>

      <p className={`mt-4 text-xs ${opened ? "text-ok" : "text-muted"}`} role="status">
        {opened
          ? "Paystack checkout opened in a new tab. Approve it there, or use the steps above."
          : "Your browser blocked the new tab. Use the button below to open Paystack and pay now."}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <button type="button" onClick={onOpen} className="btn-primary w-full !py-3 text-base">
          {opened ? "Reopen Paystack checkout" : "Continue to secure payment"} <span aria-hidden>→</span>
        </button>
        <button type="button" onClick={onOpenHere} className="btn-ghost w-full">
          Open Paystack in this tab
        </button>
      </div>

      <p className="mt-3 text-[11px] text-muted">Never share your MoMo PIN with anyone.</p>
    </section>
  );
}

/** Opens Paystack in a new tab so this help stays visible; false = popup blocked. */
function openPaymentWindow(url: string): boolean {
  try {
    return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
  } catch {
    return false;
  }
}

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
  account?: { name: string } | null;
  paymentMethod?: PaymentMethod;
  onSuccess?: () => void;
  requireAgreement?: boolean;
  agreementLabel?: string;
  agreementTerms?: string;
  showMtnApprovalHelp?: boolean;
}) {
  const [name, setName] = useState(account?.name ?? "");
  // Deliberately not pre-filled from the account: whichever address is typed
  // here is where the files and receipt are sent, and buyers can enter any
  // address they can access.
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<string>("mtn");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [mtnHelp, setMtnHelp] = useState<{ url: string; opened: boolean } | null>(null);

  /**
   * The browser's own `type="email"` check accepts addresses such as `kwame@`
   * or `kwame@gmail`, and the server rejects those with a message the customer
   * only sees after pressing pay. So the same rule runs here first, on blur and
   * again before submitting.
   */
  function validateEmail(value: string): string | null {
    if (!value.trim()) return "Enter your email address — your files are delivered there.";
    return isValidEmail(value) ? null : EMAIL_ERROR;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const emailProblem = validateEmail(email);
    if (emailProblem) {
      setEmailError(emailProblem);
      return;
    }
    setEmailError(null);
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
      // MTN MoMo: hand the customer straight to Paystack and keep the
      // *170# approval steps on screen in case the prompt never arrives.
      if (showMtnApprovalHelp && network === "mtn") {
        setLoading(false);
        setMtnHelp({ url: json.url, opened: openPaymentWindow(json.url) });
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
        <input
          id="co-email"
          type="email"
          className="field"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          onBlur={() => setEmailError(validateEmail(email))}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "co-email-error" : undefined}
          required
        />
        <p className="mt-1.5 text-xs text-muted">
          {account
            ? "Your files, license and receipt go to this address — type any email you can open. The purchase still shows in Your account either way."
            : "Your files, license and receipt are delivered to this address. Use your account email to see purchases in Your account."}
        </p>
        {emailError && (
          <p id="co-email-error" role="alert" className="mt-1.5 text-xs font-semibold text-danger">
            {emailError}
          </p>
        )}
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
      {showMtnApprovalHelp && network === "mtn" && mtnHelp && (
        <MtnApprovalHelp
          opened={mtnHelp.opened}
          onOpen={() => setMtnHelp({ url: mtnHelp.url, opened: openPaymentWindow(mtnHelp.url) })}
          onOpenHere={() => window.location.assign(mtnHelp.url)}
          onDismiss={() => setMtnHelp(null)}
        />
      )}
    </form>
  );
}
