"use client";

import { useFormState, useFormStatus } from "react-dom";
import { changeEmailAction, type AuthState } from "@/app/(site)/account/actions";
import { EMAIL_ERROR, isValidEmail } from "@/lib/email-address";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn-ghost w-full !py-3${pending ? " is-busy" : ""}`} disabled={pending}>
      {pending ? "Saving…" : "Change email"}
    </button>
  );
}

/**
 * Lets a signed-in artist move their account to a different email address.
 * The current password is required, and the new address is checked here as
 * well as on the server so a typo is caught before anything is submitted.
 */
export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [state, action] = useFormState<AuthState, FormData>(changeEmailAction, undefined);

  function validate(value: string): string | null {
    if (!value.trim()) return "Enter the new email address you want to use.";
    if (!isValidEmail(value)) return EMAIL_ERROR;
    if (value.trim().toLowerCase() === currentEmail.toLowerCase()) return "That is already the email on your account.";
    return null;
  }

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const problem = validate(String(data.get("email") ?? ""));
        if (problem) {
          event.preventDefault();
          const field = event.currentTarget.elements.namedItem("email") as HTMLInputElement | null;
          field?.setCustomValidity(problem);
          field?.reportValidity();
          field?.setCustomValidity("");
        }
      }}
    >
      <div>
        <label className="label" htmlFor="account-email">
          New email address
        </label>
        <input
          id="account-email"
          name="email"
          type="email"
          className="field"
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="account-email-password">
          Current password
        </label>
        <input
          id="account-email-password"
          name="password"
          type="password"
          className="field"
          placeholder="Your Meetbeatz password"
          autoComplete="current-password"
          required
        />
        <p className="mt-1.5 text-[11px] text-muted">
          We ask for it so nobody else can point your account, licenses and downloads at their own inbox.
        </p>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          {state.ok}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
