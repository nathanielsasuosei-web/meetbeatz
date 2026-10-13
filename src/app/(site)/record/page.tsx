import type { Metadata } from "next";
import Link from "next/link";
import { RemoteRecorder } from "@/components/remote-recorder";
import { MicIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { listBeats } from "@/lib/catalog";
import { getCustomerSession } from "@/lib/customer-auth";
import { money } from "@/lib/format";
import { ensureSeeded } from "@/lib/seed";
import { getSettings } from "@/lib/settings";
import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Record online with the producer",
  description:
    "Record a vocal take in your browser over any beat, keep the good takes, and send the best one to the producer to book a live online session.",
};
export const dynamic = "force-dynamic";

/** The slug the seeded remote-session service is booked under. */
const ONLINE_SERVICE_SLUG = "online-session";

const TIPS = [
  {
    title: "Headphones, always",
    body: "The backing has to stay out of the microphone. With speakers on, the beat bleeds into the take and no mix can remove it afterwards — and monitoring your own voice through speakers will feed back.",
  },
  {
    title: "Get the level right before the first take",
    body: "Sing the loudest line you have and watch the meter: peaks should reach the yellow. Anything in the red is clipped, and clipping cannot be undone. Turn the mic gain down, not up.",
  },
  {
    title: "Room first, plugin later",
    body: "A wardrobe, a duvet over a door frame or a corner full of soft furniture beats any treatment a browser can apply. Record dry — the reverb and tuning happen in the session, where they can be changed.",
  },
  {
    title: "Distance is a sound",
    body: "A hand-span from the mic is intimate and bassy; two spans is open and sits back in a mix. Move, do not turn the gain up. Keep the low cut on unless you are deliberately working the proximity effect.",
  },
];

const FAQ = [
  {
    q: "What exactly gets recorded?",
    a: "Your microphone, and nothing else. The backing track is routed to your headphones but never into the recording chain, so the file you download — and the file you send — is a dry vocal with no beat in it. That is also why a scratch take over a store preview is safe.",
  },
  {
    q: "Is my take uploaded automatically?",
    a: "No. Takes live in the browser tab and disappear when you close it. Nothing leaves your device until you press send, and sending needs a free account so the take lands on your page instead of nowhere.",
  },
  {
    q: "What quality do I get?",
    a: "A mono 16-bit WAV at your audio interface's own sample rate — 44.1 or 48 kHz on most devices. That is a real recording, not a voice memo, and it is what the producer comps and mixes from.",
  },
  {
    q: "Can the producer hear me live?",
    a: "Sending a take books the session and starts the conversation. The live session itself runs on a call the producer sets up when he confirms the time — book the online studio slot so the time is paid for and locked, then join the link he sends in your chat.",
  },
  {
    q: "My phone records fine, is that enough?",
    a: "For writing and reference takes, yes. For a release vocal, a USB or XLR microphone into a laptop gets you noticeably closer to the record you hear on the store.",
  },
];

export default async function RecordPage() {
  await ensureSeeded();
  const [settings, beats, account, onlineService] = await Promise.all([
    getSettings(),
    listBeats({ limit: 40 }),
    getCustomerSession(),
    db.select().from(services).where(eq(services.slug, ONLINE_SERVICE_SLUG)).limit(1).then((rows) => rows[0] ?? null),
  ]);

  const backing = beats
    .filter((beat) => beat.previewUrl)
    .map((beat) => ({ id: beat.id, title: beat.title, previewUrl: beat.previewUrl as string }));

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
            <MicIcon className="h-4 w-4 text-acid" />
            <p className="eyebrow !tracking-[0.18em]">Online recording · anywhere</p>
          </div>
          <h1 className="display mt-4 max-w-4xl text-5xl md:text-7xl">Record with the producer, without the drive.</h1>
          <p className="mt-5 max-w-2xl text-base text-cream/80">
            A vocal booth in your browser. Load a beat or your own instrumental, record takes with headphone monitoring and
            a live level meter, keep the ones that work, and send the best to {settings.siteName} to book the live session.
          </p>
          {onlineService && (
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <div className="glass rounded-2xl px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-muted">Live session with the producer</p>
                <p className="display text-2xl text-acid">{money(onlineService.pricePerHour, settings.currency)}<span className="ml-1 text-xs text-muted">/ hour</span></p>
              </div>
              <Link href={`/studio?service=${ONLINE_SERVICE_SLUG}`} className="btn-primary">
                Book the session time
              </Link>
              <Link href="/distribution" className="btn-ghost">
                Distribute it after
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <p className="eyebrow">The booth</p>
        <h2 className="display mt-2 text-3xl md:text-4xl">Record a take.</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Headphones on. Mic gain set so the loudest line peaks in the yellow. Everything below runs in your browser —
          nothing is uploaded until you press send.
        </p>
        <div className="mt-8">
          <RemoteRecorder
            beats={backing}
            account={account ? { name: account.name, email: account.email } : null}
            currency={settings.currency}
            onlineServiceSlug={ONLINE_SERVICE_SLUG}
          />
        </div>
      </section>

      <section className="glass-section">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <p className="eyebrow">Getting a usable take</p>
          <Reveal className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {TIPS.map((tip) => (
              <div key={tip.title} className="card p-5">
                <h3 className="font-bold">{tip.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{tip.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <p className="eyebrow">Questions</p>
        <Reveal className="mt-4 space-y-3">
          {FAQ.map((item) => (
            <div key={item.q} className="glass rounded-2xl p-4">
              <p className="text-sm font-bold">{item.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.a}</p>
            </div>
          ))}
        </Reveal>
      </section>
    </>
  );
}
