import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shared shell for the policy pages (privacy, terms, refunds) and the
 * licensing guide.
 *
 * All of them are long-form text, so the layout keeps a readable measure:
 * a table of contents that collapses to a scrollable strip on phones, and
 * `legal-prose` typography (see globals.css) tuned for small screens.
 */

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
  related = [],
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  /** ISO date the copy was last revised, shown at the top and bottom. */
  updated: string;
  sections: LegalSection[];
  related?: { href: string; label: string; description: string }[];
  children?: ReactNode;
}) {
  const updatedLabel = new Date(`${updated}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl md:text-6xl">{title}</h1>
        <p className="mt-5 text-base leading-relaxed text-cream/80">{intro}</p>
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted">Last updated {updatedLabel}</p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow">On this page</p>
          <ol className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
            {sections.map((s, i) => (
              <li key={s.id} className="shrink-0 lg:shrink">
                <a
                  href={`#${s.id}`}
                  className="flex items-baseline gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm text-cream/75 transition hover:bg-white/5 hover:text-acid lg:whitespace-normal"
                >
                  <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
          <div className="mt-4 hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-muted lg:block">
            Need a plain-language answer instead of the legalese?{" "}
            <Link href="/contact" className="font-semibold text-acid hover:underline">
              Ask us directly →
            </Link>
          </div>
        </nav>

        <div className="min-w-0 max-w-3xl">
          <div className="legal-prose space-y-10">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="display flex items-baseline gap-3 text-2xl sm:text-3xl">
                  <span className="font-mono text-sm text-acid">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="mt-4 space-y-3">{s.content}</div>
              </section>
            ))}
          </div>

          {children}

          <p className="mt-12 text-xs text-muted">
            Applies to every purchase, booking and download made through this website. Questions about anything on this page?{" "}
            <Link href="/contact" className="font-semibold text-acid hover:underline">
              Contact the studio
            </Link>
            .
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14 border-t border-white/10 pt-10">
          <p className="eyebrow">Read next</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link key={r.href} href={r.href} className="card group p-5">
                <p className="font-bold group-hover:text-acid">{r.label}</p>
                <p className="mt-1 text-sm text-muted">{r.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** A FAQ list rendered as native <details>, so it works without JavaScript. */
export function LegalFaq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="mt-12">
      <p className="eyebrow">Quick answers</p>
      <h2 className="display mt-2 text-2xl sm:text-3xl">Frequently asked</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <details key={item.q} className="card group px-5 py-4">
            <summary className="cursor-pointer list-none text-sm font-bold text-cream sm:text-base">
              <span className="flex items-start justify-between gap-4">
                {item.q}
                <span className="mt-0.5 shrink-0 text-acid transition group-open:rotate-45">＋</span>
              </span>
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-muted">{item.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
