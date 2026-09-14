"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display text-4xl sm:text-5xl">This page could not load.</h1>
      <p className="text-muted">
        The server hit an unexpected error. On a fresh deployment the usual cause is an unreachable
        database: make sure <code className="text-cream">DATABASE_URL</code> points at a hosted
        PostgreSQL instance (a <code className="text-cream">localhost</code> or{" "}
        <code className="text-cream">127.0.0.1</code> address will not work on Vercel).
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-ghost">
          Back home
        </Link>
        <Link href="/api/health" className="btn-ghost">
          Database status
        </Link>
      </div>
      {error.digest ? <p className="mt-4 text-xs text-muted">Error digest: {error.digest}</p> : null}
    </main>
  );
}
