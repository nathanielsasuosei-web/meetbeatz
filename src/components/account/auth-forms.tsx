"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, registerAction, type AuthState } from "@/app/(site)/account/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn-primary w-full py-3!${pending ? " is-busy" : ""}`} disabled={pending}>
      {pending ? "One moment…" : label}
    </button>
  );
}

function ErrorBox({ state }: { state: AuthState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="auth-error rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {state.error}
    </p>
  );
}

function SocialButtons() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-semibold text-muted">or continue with</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid gap-2">
        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition hover:bg-zinc-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </a>
        <a
          href="/api/auth/facebook"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0866FF] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#075CE0]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden>
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Continue with Facebook
        </a>
        <a
          href="/api/auth/apple"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-900"
        >
          <svg width="16" height="18" viewBox="0 0 24 24" fill="white" aria-hidden>
            <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.07-3.623-2.304-4.34-2.339-2.03-.165-3.675 1.09-4.657 1.09zM11.59 5.04c.41-1.63.85-2.67 1.84-3.84 1.18 1.28 2.08 2.97 1.8 4.87-1.49.124-2.97-.71-3.64-1.03z" />
          </svg>
          Continue with Apple
        </a>
      </div>
      <p className="text-center text-[11px] text-muted">Social login creates your student ID automatically. You can add age, country &amp; city afterwards if missing.</p>
    </div>
  );
}

export function CustomerLoginForm() {
  const [state, action] = useFormState<AuthState, FormData>(loginAction, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="auth-form space-y-4">
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
      </form>
      <SocialButtons />
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/account/register" className="font-semibold text-acid hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function CustomerRegisterForm() {
  const [state, action] = useFormState<AuthState, FormData>(registerAction, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="auth-form space-y-4">
        <div>
          <label className="label" htmlFor="name">Your name / artist name</label>
          <input id="name" name="name" className="field" autoComplete="name" required placeholder="e.g. Kwame Keys" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="field" autoComplete="username" required placeholder="you@example.com" />
          <p className="mt-1 text-[11px] text-muted">Use the same email you bought beats with — those purchases join your account automatically.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="country">Country</label>
            <input id="country" name="country" className="field" autoComplete="country-name" required placeholder="e.g. Ghana" />
          </div>
          <div>
            <label className="label" htmlFor="city">City</label>
            <input id="city" name="city" className="field" autoComplete="address-level2" required placeholder="e.g. Accra" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="age">Age</label>
          <input
            id="age"
            name="age"
            type="number"
            className="field"
            autoComplete="off"
            required
            min={1}
            max={120}
            placeholder="e.g. 22"
            inputMode="numeric"
          />
          <p className="mt-1 text-[11px] text-muted">Students — please add your age so the studio can tailor your experience.</p>
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="field" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" />
        </div>
        <ErrorBox state={state} />
        <SubmitButton label="Create account" />
      </form>
      <SocialButtons />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/account/login" className="font-semibold text-acid hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
