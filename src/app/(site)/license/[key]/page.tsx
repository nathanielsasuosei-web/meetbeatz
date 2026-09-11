import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { licenses, orders } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { DELIVERABLE_LABELS, deliverableList, formatDate, money } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export const metadata: Metadata = { title: "License certificate" };

export default async function LicensePage({ params }: { params: Promise<{ key: string }> }) {
  await ensureSeeded();
  const { key } = await params;
  const [row] = await db
    .select({ lic: licenses, order: orders })
    .from(licenses)
    .innerJoin(orders, eq(licenses.orderId, orders.id))
    .where(eq(licenses.licenseKey, decodeURIComponent(key).toUpperCase()))
    .limit(1);
  if (!row) notFound();
  const { lic, order } = row;
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/orders/${order.reference}`} className="text-sm font-semibold text-muted hover:text-cream">
          ← Back to order
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-3xl border border-line bg-cream p-8 text-ink shadow-2xl print:border-0 print:shadow-none md:p-12">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-6">
          <div>
            <p className="display text-2xl tracking-[0.18em]">
              MEET<span className="text-acid-2">BEATZ</span>
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-ink/60">Beat license certificate</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-ink/60">License key</p>
            <p className="font-mono text-lg font-bold">{lic.licenseKey}</p>
            <p className="mt-1 text-xs text-ink/60">Issued {formatDate(lic.issuedAt)}</p>
          </div>
        </header>

        <section className="mt-8">
          <p className="text-xs uppercase tracking-[0.2em] text-ink/60">This certifies that</p>
          <p className="display mt-2 text-4xl">{lic.customerName}</p>
          <p className="mt-1 text-sm text-ink/70">{lic.customerEmail}</p>
          <p className="mt-6 text-sm leading-relaxed text-ink/80">
            has been granted a <strong>{lic.licenseName}</strong>
            {lic.isExclusive ? " (exclusive)" : " (non-exclusive)"} license by <strong>{settings.siteName}</strong> for the musical composition titled
          </p>
          <p className="display mt-3 text-3xl">“{lic.beatTitle}”</p>
        </section>

        <dl className="mt-8 grid gap-4 border-y border-ink/15 py-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-ink/60">Files included</dt>
            <dd className="mt-1 font-semibold">{deliverableList(lic.deliverables).map((d) => DELIVERABLE_LABELS[d] ?? d).join(", ")}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-ink/60">License fee</dt>
            <dd className="mt-1 font-semibold">{money(lic.price, lic.currency)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-ink/60">Order reference</dt>
            <dd className="mt-1 font-mono font-semibold">{order.reference}</dd>
          </div>
        </dl>

        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-ink/60">Terms of use</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/85">{lic.terms || "See the producer's standard license terms."}</p>
          <p className="mt-4 text-sm leading-relaxed text-ink/85">
            Producer credit must appear as <strong>&quot;Prod. by {settings.siteName}&quot;</strong>. This certificate, together with the payment record{" "}
            <span className="font-mono">{order.reference}</span>, constitutes proof of license. Verify online at{" "}
            <span className="font-mono">/license/{lic.licenseKey}</span>.
          </p>
        </section>

        <footer className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t-2 border-ink pt-6">
          <div>
            <p className="display text-xl">{settings.siteName}</p>
            <p className="text-xs text-ink/60">
              {settings.location} · {settings.contactEmail}
            </p>
          </div>
          <div className="rounded-lg border-2 border-acid-2 px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink/60">Status</p>
            <p className="font-black text-acid-2">VERIFIED</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
