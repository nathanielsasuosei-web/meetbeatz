import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { getSettings } from "@/lib/settings";
import { num } from "@/lib/format";

export const metadata: Metadata = {
  title: "How it works",
  description: "See how to choose a beat license, pay securely, and receive your files and license certificate.",
};
export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  const settings = await getSettings();
  const steps = [
    {
      n: "01",
      title: "Pick a beat & license",
      text: "Preview every beat in full, then choose Basic, Premium, Unlimited or Exclusive rights depending on your release plans.",
    },
    {
      n: "02",
      title: "Pay with Mobile Money",
      text: `MTN MoMo, Telecel Cash, AirtelTigo Money or card. A transparent ${num(settings.feePercent)}% service fee is shown before you pay — no hidden charges.`,
    },
    {
      n: "03",
      title: "Check your email",
      text: "Your download links, license key and a signed license certificate are emailed to you instantly. Keep it as proof of purchase.",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <Link href="/" className="text-sm font-semibold text-muted hover:text-cream">← Back to home</Link>
      <section className="glass-section mt-8 rounded-3xl px-5 py-10 sm:px-8 md:py-14">
        <p className="eyebrow">How it works</p>
        <h1 className="display mt-2 max-w-2xl text-3xl sm:text-4xl md:text-5xl">From preview to your inbox in three taps.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Everything you need to choose the right license, pay securely, and receive your beat files without waiting.
        </p>
        <Reveal className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.n} className="card p-5 md:p-6">
              <p className="display text-4xl text-acid drop-shadow-[0_0_18px_rgba(198,241,53,0.35)]">{step.n}</p>
              <h2 className="mt-4 text-lg font-bold">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
            </article>
          ))}
        </Reveal>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/beats" className="btn-primary">Browse beats</Link>
          <Link href="/licensing" className="btn-ghost">Compare licenses</Link>
        </div>
      </section>
    </div>
  );
}
