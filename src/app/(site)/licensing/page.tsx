import type { Metadata } from "next";
import Link from "next/link";
import { LegalFaq, LegalPage } from "@/components/legal-page";
import { DELIVERABLE_LABELS, deliverableList, money } from "@/lib/format";
import { listLicenseTypes } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Beat Licensing",
  description:
    "Compare Basic, Premium, Unlimited and Exclusive beat licenses: files included, usage, credit requirements and how to upgrade before your release.",
};

export const dynamic = "force-dynamic";

const UPDATED = "2026-10-05";

export default async function LicensingPage() {
  const [settings, licenseTypes] = await Promise.all([getSettings(), listLicenseTypes()]);
  const cheapest = licenseTypes.length ? Math.min(...licenseTypes.map((l) => Number(l.defaultPrice))) : null;

  return (
    <LegalPage
      eyebrow="Licensing · Beat store"
      title="Beat Licensing Guide"
      updated={UPDATED}
      intro={
        <>
          Buying a beat is buying <strong>rights to use it</strong>, and the size of those rights depends on the license you pick. This page
          explains each tier in plain language, shows exactly what lands in your inbox, and covers the rules that apply to every purchase.
        </>
      }
      related={[
        { href: "/beats", label: "Browse the beat store", description: "Hear full previews and see each beat's license prices." },
        { href: "/terms", label: "Terms & Conditions", description: "The full agreement behind every license." },
        { href: "/refunds", label: "Refund Policy", description: "What happens if a file or session goes wrong." },
      ]}
      sections={[
        {
          id: "how-it-works",
          title: "What a beat license actually is",
          content: (
            <>
              <p>
                {settings.siteName} writes, produces and owns every beat in the store. When you buy a license you are granted permission to use that
                recording in your own song for a defined scope — one song, a set number of streams and copies, and specific uses like videos, radio
                and live shows. The copyright in the composition stays with the studio unless you buy Exclusive Rights.
              </p>
              <p>
                Every purchase is issued as a <strong>license certificate</strong> with a unique key, listing the beat, the tier, what you may do
                with it and the terms that apply. Distributors, labels and streaming platforms accept it as proof that your release is cleared, so
                keep it with your release files.
              </p>
              <p>
                {cheapest !== null && (
                  <>
                    Licenses currently start at <strong>{money(cheapest, settings.currency)}</strong>. Prices are set per beat — open any beat to see
                    its own four tiers.
                  </>
                )}
              </p>
            </>
          ),
        },
        {
          id: "tiers",
          title: "Compare the tiers",
          content: (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {licenseTypes.map((lt) => (
                  <div key={lt.id} className={`${lt.isExclusive ? "glass-acid" : "card"} flex flex-col rounded-2xl p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold">{lt.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{lt.tagline}</p>
                      </div>
                      {lt.isExclusive && <span className="badge-acid shrink-0">Exclusive</span>}
                    </div>
                    <p className="display mt-4 text-3xl text-acid drop-shadow-[0_0_16px_rgba(198,241,53,0.3)]">
                      {money(lt.defaultPrice, settings.currency)}
                      <span className="ml-1.5 align-baseline text-xs font-semibold uppercase tracking-wider text-muted">from</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {deliverableList(lt.deliverables).map((d) => (
                        <span key={d} className="badge">
                          {DELIVERABLE_LABELS[d] ?? d.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{lt.description}</p>
                  </div>
                ))}
              </div>

              <div className="legal-scroll mt-6">
                <table>
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Price from</th>
                      <th>Files you receive</th>
                      <th>Rights</th>
                      <th>Beat stays in the store</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licenseTypes.map((lt) => (
                      <tr key={lt.id}>
                        <td>
                          <strong>{lt.name}</strong>
                        </td>
                        <td>{money(lt.defaultPrice, settings.currency)}</td>
                        <td>{deliverableList(lt.deliverables).map((d) => DELIVERABLE_LABELS[d] ?? d.toUpperCase()).join(" + ") || "—"}</td>
                        <td>{lt.isExclusive ? "Exclusive — yours alone" : "Non-exclusive lease"}</td>
                        <td>{lt.isExclusive ? "No — removed after purchase" : "Yes — other artists may license it"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>The exact terms of each tier</h3>
              <p>
                These are the clauses that appear on your certificate. The caps that apply to your purchase are the ones written here for the tier
                you bought.
              </p>
              <div className="mt-3 space-y-3">
                {licenseTypes.map((lt) => (
                  <details key={lt.id} className="card group px-5 py-4">
                    <summary className="cursor-pointer list-none text-sm font-bold">
                      <span className="flex items-start justify-between gap-4">
                        {lt.name} — full license terms
                        <span className="mt-0.5 shrink-0 text-acid transition group-open:rotate-45">＋</span>
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted">{lt.terms}</p>
                  </details>
                ))}
              </div>
            </>
          ),
        },
        {
          id: "included",
          title: "What every license includes",
          content: (
            <>
              <ul>
                <li>
                  <strong>Your files, delivered instantly.</strong> Tagless audio as listed for your tier — MP3, WAV and, on higher tiers, the track
                  stems for a proper mix.
                </li>
                <li>
                  <strong>A license certificate.</strong> A printable page with your name, the beat, the license key, the tier and its terms.
                </li>
                <li>
                  <strong>One song.</strong> Every license covers a single new song. A second song — even over the same beat — needs its own license.
                </li>
                <li>
                  <strong>Producer credit.</strong> All licenses require the credit “Prod. by {settings.siteName}” in release metadata and video
                  descriptions.
                </li>
                <li>
                  <strong>Re-downloads.</strong> Lose a file and we reissue it from your order — no extra charge.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "not-allowed",
          title: "What no license allows",
          content: (
            <>
              <ul>
                <li>Reselling, sublicensing or giving away the beat as a standalone file or sample pack.</li>
                <li>Registering the beat with Content ID, YouTube’s Content ID or any similar system, or claiming it as your own production.</li>
                <li>Releasing the beat itself (or an instrumental version of it) as your own track, mixtape or album.</li>
                <li>Using the beat in another artist’s song unless that artist is named on the license or buys their own.</li>
                <li>Exceeding the stream, copy, video or broadcast caps of the tier you bought — upgrade the license instead.</li>
                <li>Transferring the license to someone else, or to a label, without our written agreement.</li>
              </ul>
              <p>
                Exceeding a cap is a breach of the license. If your song takes off beyond your tier, contact us — upgrades are priced as the
                difference, and we would much rather sort it out than have your release pulled.
              </p>
            </>
          ),
        },
        {
          id: "credits",
          title: "Credits, splits and clearances",
          content: (
            <>
              <p>
                Credits matter. Put <strong>“Prod. by {settings.siteName}”</strong> wherever your release shows credits — streaming metadata, video
                descriptions, liner notes and any artwork that credits producers. If a track blows up without the credit, we may ask you to add it,
                and platforms allow it to be corrected after release.
              </p>
              <h3>Publishing</h3>
              <p>
                Non-exclusive leases grant you the recording rights you need to release the song; the composition remains the studio’s work and
                remains licensed to other artists. Exclusive Rights transfer the exclusive right to use that beat to you, while the studio keeps its
                writing credit and the publish split set out in the exclusive terms unless we agree something different in writing.
              </p>
              <h3>Labels, TV, film and games</h3>
              <p>
                If a label wants to release your song, or a sync opportunity (film, TV, advert, game) comes up, tell us early. We will confirm the
                tier covers it or put an upgrade in place, and provide whatever documentation the label or broadcaster needs.
              </p>
            </>
          ),
        },
        {
          id: "upgrade",
          title: "Upgrading and going exclusive",
          content: (
            <>
              <p>
                Outgrown your lease? You can upgrade at any time: you pay the difference between what you paid and the new tier, and we reissue your
                certificate to match. The rules for exclusive rights are the important part:
              </p>
              <ul>
                <li>Exclusive Rights are sold once, to one artist, and the beat is removed from the store afterwards.</li>
                <li>Leases issued before the exclusive sale stay valid for their full term, so nobody is left unprotected.</li>
                <li>Exclusive purchases are final — they cannot be undone or refunded. Ask us first if you are unsure.</li>
                <li>
                  To upgrade a lease to exclusive, contact the studio; we will confirm the beat is still available and quote the balance. See the{" "}
                  <Link href="/refunds">Refund Policy</Link> for how the money side works.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "sound-kits",
          title: "Sound kits and free downloads",
          content: (
            <>
              <p>
                Sound kits in the free library are royalty-free to use in your own productions — no credit required, no fee, no limit on the songs
                you make with them. What you may not do is resell, re-upload or redistribute the pack itself, whether as-is, reorganised or as part
                of another sample pack. Individual loops may not be distributed as standalone files.
              </p>
              <p>
                Together with the obvious benefit of free sounds, kit downloads sometimes include extra license notes on the kit page — where a
                vendor’s terms differ, those notes win for that kit.
              </p>
            </>
          ),
        },
        {
          id: "buy",
          title: "How to buy in three steps",
          content: (
            <>
              <ol>
                <li>
                  <strong>Pick a beat.</strong> Preview it in full on the store — no watermarks, no truncated clips.
                </li>
                <li>
                  <strong>Choose your tier.</strong> Match the cap to your release plan: demos and mixtapes need less than a label campaign. The
                  total, including the transparent service fee, is shown before you pay.
                </li>
                <li>
                  <strong>Pay with Mobile Money or card.</strong> MTN MoMo, Telecel Cash, AirtelTigo Money and Visa/Mastercard are all accepted
                  through Paystack. Your files and certificate are emailed the moment the payment clears, and every order is always available on the{" "}
                  <Link href="/account">account page</Link>.
                </li>
              </ol>
            </>
          ),
        },
      ]}
    >
      <LegalFaq
        items={[
          {
            q: "Which tier should I buy?",
            a: (
              <>
                Match the cap to your release plan. Basic suits demos, mixtapes and first singles; Premium covers a proper independent release;
                Unlimited removes the caps for artists who plan videos, radio and paid shows; Exclusive is for songs you want to own outright.
                Compare the caps in the table above, or ask us and we will tell you honestly which one you need — it is cheaper than upgrading
                twice.
              </>
            ),
          },
          {
            q: "Can I upgrade later?",
            a: <>Yes. You pay the difference and we reissue your certificate. Just contact the studio with your order reference.</>,
          },
          {
            q: "What if my song blows up past my stream cap?",
            a: (
              <>
                Come and upgrade. It is priced as the difference, and no platform will pull your release while we sort it out.
              </>
            ),
          },
          {
            q: "Do I need to credit the producer on every tier?",
            a: <>Yes — “Prod. by {settings.siteName}” is required by all four tiers, including exclusive.</>,
          },
          {
            q: "Can I use the beats in YouTube videos and reels?",
            a: <>Yes, subject to the video allowance of your tier. Many artists also find a lease is all they need for monetised content features around their song.</>,
          },
        ]}
      />

      <div className="glass-strong mt-12 rounded-3xl p-6 text-center sm:p-8">
        <p className="eyebrow">Ready to release</p>
        <h2 className="display mt-2 text-3xl sm:text-4xl">Hear the beats and pick your tier.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
          Every beat page shows its own prices for all four licenses, plus the full preview before you pay a cedi.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/beats" className="btn-primary">
            Browse beats
          </Link>
          <Link href="/contact" className="btn-ghost">
            Ask a licensing question
          </Link>
        </div>
      </div>
    </LegalPage>
  );
}
