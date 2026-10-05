import type { Metadata } from "next";
import Link from "next/link";
import { LegalFaq, LegalPage } from "@/components/legal-page";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms that govern buying beats and licenses, booking studio time and using the Meetbeatz website.",
};

export const dynamic = "force-dynamic";

const UPDATED = "2026-10-05";

export default async function TermsPage() {
  const settings = await getSettings();

  return (
    <LegalPage
      eyebrow="Legal · Terms"
      title="Terms & Conditions"
      updated={UPDATED}
      intro={
        <>
          These terms are the agreement between you and {settings.siteName} when you use this website, buy a beat license or book studio time. By
          placing an order you accept them, so please read them once — especially the licensing and refund sections.
        </>
      }
      related={[
        { href: "/licensing", label: "Beat licensing guide", description: "Compare Basic, Premium, Unlimited and Exclusive rights." },
        { href: "/refunds", label: "Refund Policy", description: "What is refundable, and what is not." },
        { href: "/privacy", label: "Privacy Policy", description: "What we do with your personal information." },
      ]}
      sections={[
        {
          id: "agreement",
          title: "The agreement",
          content: (
            <>
              <p>
                This website and the beats, sound kits and studio services offered on it are operated by {settings.siteName} ({settings.location}).
                In these terms “we”, “us” and “the studio” mean {settings.siteName}; “you” means the person buying or booking.
              </p>
              <p>
                By browsing the store, creating an account, buying a license or booking a session you agree to these terms. If you do not agree
                with them, please do not place an order.
              </p>
            </>
          ),
        },
        {
          id: "eligibility",
          title: "Who can order",
          content: (
            <>
              <p>
                You must be at least 18 years old, or have a parent or guardian place the order with you, to buy a license or book studio time.
                You confirm that the details you give us are accurate and that you are entitled to use any payment method you present.
              </p>
              <p>
                If an account is created in your name, you are responsible for keeping your password private and for activity that happens under
                that account.
              </p>
            </>
          ),
        },
        {
          id: "license",
          title: "Buying a beat license",
          content: (
            <>
              <p>
                Every beat on the store belongs to {settings.siteName}. What you buy is a <strong>license to use it</strong> for the scope listed
                on the beat page and your license certificate — not ownership of the composition, unless you buy Exclusive Rights.
              </p>
              <ul>
                <li>
                  <strong>Non-exclusive licenses</strong> (Basic, Premium, Unlimited) let you use the beat within the distribution, streaming,
                  video, broadcast and performance limits of that tier, while the studio may continue to license the same beat to others.
                </li>
                <li>
                  <strong>Exclusive Rights</strong> remove the beat from the store and stop it being licensed again after your purchase. Any
                  non-exclusive licenses issued before your purchase stay valid.
                </li>
                <li>
                  Full details of each tier — deliverables, usage caps and credit requirements — live on the{" "}
                  <Link href="/licensing">licensing page</Link> and in your license certificate.
                </li>
              </ul>
              <p>
                Licenses are granted to the person named on the order and are <strong>non-transferable</strong>. You may not resell, sublicense,
                share or redistribute the beat as a standalone file, and you may not register it with a content ID system or claim it as your own
                production.
              </p>
            </>
          ),
        },
        {
          id: "delivery",
          title: "Delivery of files",
          content: (
            <>
              <p>
                Files and your license certificate are delivered by email and through your account as soon as the payment is confirmed, usually
                within seconds. Download links are personal to your order — keep them to yourself, because we may disable links that are shared
                publicly or downloaded excessively.
              </p>
              <p>
                If a link expires or a file will not open, contact us and we will reissue the download. If we cannot deliver your files at all,
                you are entitled to a refund under our <Link href="/refunds">Refund Policy</Link>.
              </p>
            </>
          ),
        },
        {
          id: "studio",
          title: "Studio bookings",
          content: (
            <>
              <ul>
                <li>Bookings are confirmed when the deposit is paid; the confirmation email shows your slot and the balance due.</li>
                <li>The balance is payable at the studio before your session begins, unless we agree otherwise in writing.</li>
                <li>
                  Please arrive on time. Session time is reserved for you; late arrival still ends at the scheduled finish so the next artist is
                  not affected.
                </li>
                <li>
                  Reschedule at least 24 hours before your slot and your deposit moves with you. Inside 24 hours, we may retain the deposit — see
                  the <Link href="/refunds">Refund Policy</Link>.
                </li>
                <li>
                  Bring your own instrumental files where you can. {settings.bookingPolicy}
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "payments",
          title: "Prices, fees and payment",
          content: (
            <>
              <p>
                Prices are shown in {settings.currency} and include any taxes that apply. A transparent service fee (currently{" "}
                {settings.feePercent}%) is added at checkout and shown as its own line before you approve payment — there are no hidden charges.
              </p>
              <p>
                Payments are collected by Paystack by card or Mobile Money (MTN MoMo, Telecel Cash, AirtelTigo Money). Your order is only
                complete once the transaction is confirmed by the network. If a payment fails or is reversed, the license or booking is not
                issued and access to any files already released may be withdrawn.
              </p>
            </>
          ),
        },
        {
          id: "refunds",
          title: "Refunds",
          content: (
            <>
              <p>
                Digital files and licenses are delivered instantly, so they are generally not refundable after download. The limited
                circumstances where we do refund — duplicate charges, files that cannot be delivered or opened, cancelled sessions — are set out
                in full in the <Link href="/refunds">Refund Policy</Link>, which forms part of these terms.
              </p>
            </>
          ),
        },
        {
          id: "ip",
          title: "Intellectual property",
          content: (
            <>
              <p>
                All beats, sound kits, artwork, mixes, website copy and the {settings.siteName} name and logo remain the property of the studio
                or its licensors. Nothing in these terms transfers copyright to you except the exclusive rights described above.
              </p>
              <p>
                Where a license requires producer credit, you agree to display <strong>“Prod. by {settings.siteName}”</strong> in the credits of
                any release (including streaming platform metadata where the field exists).
              </p>
              <p>
                Audio uploaded to the store or played by visitors is streamed for preview only. Downloading, ripping or re-recording previews to
                avoid a license is a breach of these terms and an infringement of copyright.
              </p>
            </>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          content: (
            <>
              <p>When using the site or booking the studio you agree not to:</p>
              <ul>
                <li>upload or send anything unlawful, hateful, defamatory or obscene, or that infringes someone else’s rights;</li>
                <li>copy, scrape, resell or attempt to bypass the store’s paywall or download limits;</li>
                <li>interfere with the site’s security, or use the studio’s name to mislead anyone about your release; or</li>
                <li>record in the studio on behalf of a third party without their permission.</li>
              </ul>
              <p>We may suspend an account or cancel a booking that breaks these rules.</p>
            </>
          ),
        },
        {
          id: "availability",
          title: "Availability and liability",
          content: (
            <>
              <p>
                We work to keep the store and studio running, but we do not promise uninterrupted availability. Beats may be added, re-priced or
                removed at any time — provided that a completed purchase is always honoured as described in its license certificate.
              </p>
              <p>
                To the fullest extent the law allows, our total liability for any claim relating to an order is limited to the amount you paid
                for that order. We are not liable for indirect losses such as lost streaming income, lost promotion or missed release dates. Nothing
                in these terms limits rights you have that cannot be excluded by law.
              </p>
            </>
          ),
        },
        {
          id: "indemnity",
          title: "Your responsibility for your release",
          content: (
            <>
              <p>
                You are responsible for your own song: its lyrics, your performance, any featured artists and any samples you add. You agree to
                cover the studio against claims that arise from content you recorded or combined with our beats.
              </p>
            </>
          ),
        },
        {
          id: "law",
          title: "Governing law and changes",
          content: (
            <>
              <p>
                These terms are governed by the laws of the Republic of Ghana, and the courts of Ghana have jurisdiction over any dispute — without
                affecting any consumer right you may have to bring a claim locally.
              </p>
              <p>
                We may update these terms as the store evolves. The version in force when you place an order is the one that applies to that order,
                and the revision date at the top of this page always shows the current text.
              </p>
              <p>
                Questions? Email <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a> or use the{" "}
                <Link href="/contact">contact page</Link>.
              </p>
            </>
          ),
        },
      ]}
    >
      <LegalFaq
        items={[
          {
            q: "Can I use the beat on Spotify, Apple Music and Boomplay?",
            a: (
              <>
                Yes — every tier includes streaming distribution, with different caps on non-exclusive leases. The <Link href="/licensing">licensing
                page</Link> lists exactly what each tier covers.
              </>
            ),
          },
          {
            q: "Do I have to credit the producer?",
            a: <>Yes. All licenses require “Prod. by {settings.siteName}” in your credits and release metadata.</>,
          },
          {
            q: "Can I send my song to a label with a lease license?",
            a: (
              <>
                You can pitch your song, but a label release needs rights that match its distribution plan — usually an Unlimited or Exclusive
                license. Talk to us before you sign anything.
              </>
            ),
          },
          {
            q: "What happens to my lease if someone buys exclusive rights?",
            a: <>Leases issued before the exclusive sale stay valid for their full term, so your release is safe.</>,
          },
        ]}
      />
    </LegalPage>
  );
}
