import type { Metadata } from "next";
import Link from "next/link";
import { DistributionForm, type PlanOption } from "@/components/distribution-form";
import { DistributeIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { listActivePlans } from "@/lib/distribution";
import { money, num } from "@/lib/format";
import { DISTRIBUTION_STORES } from "@/lib/release";
import { ensureSeeded } from "@/lib/seed";
import { getCustomerSession } from "@/lib/customer-auth";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Music distribution",
  description:
    "Release your song on Spotify, Apple Music, Boomplay, Audiomack, YouTube Music and TikTok. One flat fee, you keep your royalties, artwork checked before it goes out.",
};
export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "01",
    title: "Send the song",
    body: "Upload the finished master and the cover art, tell us the artist name and which stores you want, and pay with Mobile Money or card.",
  },
  {
    n: "02",
    title: "We check it",
    body: "Artwork measured against each store's spec, master checked for clipping and sample rate, credits and explicit flag confirmed. If something is wrong you get an email saying exactly what to change — nothing goes out broken.",
  },
  {
    n: "03",
    title: "It goes live",
    body: "The release is delivered with an ISRC and UPC assigned if you do not have your own. Stores take a few days to index it; Spotify for Artists and Apple Music for Artists access follows once it is live.",
  },
  {
    n: "04",
    title: "You get paid",
    body: "Royalty statements every month, with your share sent to the Mobile Money number or bank account you nominate. One flat fee per release — no annual subscription, no cut of your streams unless you ask for label services.",
  },
];

const REQUIREMENTS = [
  ["Audio", "WAV or FLAC, 16-bit or 24-bit, 44.1 kHz or 48 kHz. Leave headroom — a master peaking above −1 dBTP is bounced by most stores."],
  ["Artwork", "Square, 3000 × 3000px, JPG or PNG, sRGB. No store logos, no URLs, no blurry upscales. Use the colour adjuster to get there."],
  ["Rights", "You must own or have cleared everything in the recording — including samples. A release taken down for an uncleared sample is not refunded."],
  ["Credits", "Primary artist, featured artists, songwriters and producer. 'Prod. by Meetbeatz' stays on beats licensed from this store."],
];

const FAQ = [
  {
    q: "Do you take a percentage of my royalties?",
    a: "Not on the standard tiers — you pay one flat fee per release and keep everything the stores pay. The tier you pick states the split before you pay, and if you later want label services (playlist pitching, PR, a bigger advance on marketing) that is a separate conversation with its own terms.",
  },
  {
    q: "How long until my song is on Spotify?",
    a: "Delivery happens within the turnaround time on your tier, then the stores need their own indexing time — usually two to five working days. If you want a specific release date, submit at least three weeks ahead and pitch to editorial playlists at least two weeks before that.",
  },
  {
    q: "Can I distribute a song I recorded at another studio?",
    a: "Yes, as long as you own or have cleared the recording and every sample in it. You will be asked to confirm that at submission, and the same confirmation appears on your receipt.",
  },
  {
    q: "What if my release is rejected by a store?",
    a: "You get an email with the store's reason and what to change. Fixing artwork, credits or an explicit flag and re-delivering is free while the release is with us.",
  },
  {
    q: "Do I need an account?",
    a: "Yes — a free one. Your master and artwork upload to it before you pay, so the files are never lost if a payment is interrupted, and the release is tracked on your account page afterwards.",
  },
];

export default async function DistributionPage() {
  await ensureSeeded();
  const [settings, plans, account] = await Promise.all([getSettings(), listActivePlans(), getCustomerSession()]);

  const options: PlanOption[] = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    tagline: plan.tagline,
    tracks: plan.tracks,
    price: num(plan.price),
    turnaroundDays: plan.turnaroundDays,
    royaltyPercent: plan.royaltyPercent,
  }));

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="liquid-orbs absolute inset-0" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5">
            <DistributeIcon className="h-4 w-4 text-acid" />
            <p className="eyebrow !tracking-[0.18em]">Music distribution · {settings.location}</p>
          </div>
          <h1 className="display mt-4 max-w-4xl text-5xl md:text-7xl">Your song, on every store that matters.</h1>
          <p className="mt-5 max-w-2xl text-base text-cream/80">
            One flat fee per release. You keep your royalties, the artwork and master are checked against each store&apos;s
            specification before anything goes out, and ISRC and UPC codes are assigned for you when you do not have them.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {DISTRIBUTION_STORES.map((store) => (
              <span key={store.slug} className="badge">
                {store.name}
              </span>
            ))}
          </div>
          <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
            {options.map((plan) => (
              <div key={plan.id} className="glass rounded-2xl p-4">
                <p className="font-bold">{plan.name}</p>
                <p className="display mt-1 text-2xl text-acid drop-shadow-[0_0_16px_rgba(198,241,53,0.3)]">
                  {money(plan.price, settings.currency)}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">
                  {plan.tracks} track{plan.tracks > 1 ? "s" : ""} · {plan.turnaroundDays} working days
                </p>
                <p className="mt-2 text-xs text-cream/80">{plan.tagline}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <p className="eyebrow">Submit a release</p>
        <h2 className="display mt-2 text-3xl md:text-4xl">Start here.</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Fill in the release, upload both files and pay. You can save nothing halfway — the files upload to your account
          as you pick them, so an interrupted payment never loses the master.
        </p>
        <div className="mt-8">
          {options.length ? (
            <DistributionForm
              plans={options}
              feePercent={num(settings.feePercent)}
              currency={settings.currency}
              account={account ? { name: account.name, email: account.email } : null}
            />
          ) : (
            <div className="card p-10 text-center">
              <p className="text-3xl">📀</p>
              <p className="mt-3 font-semibold">Distribution tiers are not configured yet</p>
              <p className="mt-1 text-sm text-muted">The producer can switch them on in Admin → Distribution.</p>
            </div>
          )}
        </div>
      </section>

      <section className="glass-section">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <p className="eyebrow">How it works</p>
          <Reveal className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.n} className="card p-5">
                <p className="display text-3xl text-acid/70">{step.n}</p>
                <h3 className="mt-2 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow">What to send</p>
          <ul className="glass mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl text-sm">
            {REQUIREMENTS.map(([label, value]) => (
              <li key={label} className="px-4 py-3">
                <p className="font-semibold">{label}</p>
                <p className="mt-0.5 leading-relaxed text-muted">{value}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/colour-adjuster" className="btn-ghost">
              Open the colour adjuster
            </Link>
            <Link href="/record" className="btn-ghost">
              Record it online first
            </Link>
          </div>
        </div>
        <div>
          <p className="eyebrow">Questions</p>
          <Reveal className="mt-4 space-y-3">
            {FAQ.map((item) => (
              <div key={item.q} className="glass rounded-2xl p-4">
                <p className="text-sm font-bold">{item.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.a}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </>
  );
}
