"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, registerAction, type AuthState } from "@/app/(site)/account/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full py-3!" disabled={pending}>
      {pending ? "One moment…" : label}
    </button>
  );
}

function ErrorBox({ state }: { state: AuthState }) {
  if (!state?.error) return null;
  return <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{state.error}</p>;
}

export function CustomerLoginForm() {
  const [state, action] = useFormState<AuthState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="field" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="field" autoComplete="current-password" required />
      </div>
      <ErrorBox state={state} />
      <SubmitButton label="Sign in" />
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/account/register" className="font-semibold text-acid hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function CustomerRegisterForm() {
  const [state, action] = useFormState<AuthState, FormData>(registerAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Your name / artist name</label>
        <input id="name" name="name" className="field" autoComplete="name" required placeholder="e.g. Kwame Keys" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="field" autoComplete="username" required placeholder="you@example.com" />
        <p className="mt-1 text-[11px] text-muted">Use the same email you bought beats with — those purchases join your account automatically.</p>
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="field" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" />
      </div>
      <ErrorBox state={state} />
      <SubmitButton label="Create account" />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/account/login" className="font-semibold text-acid hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
