import type { Metadata } from "next";
import Link from "next/link";
import { LegalFaq, LegalPage } from "@/components/legal-page";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "When Meetbeatz refunds a beat license or studio deposit, how to request one and how long it takes to reach your account.",
};

export const dynamic = "force-dynamic";

const UPDATED = "2026-10-05";

export default async function RefundsPage() {
  const settings = await getSettings();

  return (
    <LegalPage
      eyebrow="Legal · Refunds"
      title="Refund Policy"
      updated={UPDATED}
      intro={
        <>
          Beats and licenses are delivered digitally the moment your payment clears, and studio slots are reserved just for you — so refunds work a
          little differently from a shop. This page explains exactly when you get your money back, and how to ask.
        </>
      }
      related={[
        { href: "/terms", label: "Terms & Conditions", description: "The full agreement behind every purchase." },
        { href: "/licensing", label: "Beat licensing guide", description: "Check what each license tier includes before you buy." },
        { href: "/contact", label: "Start a refund request", description: "Send us your order reference and a short note." },
      ]}
      sections={[
        {
          id: "summary",
          title: "The short version",
          content: (
            <>
              <div className="legal-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>What you bought</th>
                      <th>Refundable?</th>
                      <th>Conditions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Beat license — files not delivered or unreadable</td>
                      <td>
                        <strong>Yes</strong> — full refund
                      </td>
                      <td>Report within 14 days; we first try to reissue the files.</td>
                    </tr>
                    <tr>
                      <td>Beat license — duplicate or accidental double charge</td>
                      <td>
                        <strong>Yes</strong> — full refund
                      </td>
                      <td>Report within 14 days with both references.</td>
                    </tr>
                    <tr>
                      <td>Beat license — you changed your mind after downloading</td>
                      <td>
                        <strong>No</strong>
                      </td>
                      <td>Files cannot be “returned”. Ask about swapping to another beat instead.</td>
                    </tr>
                    <tr>
                      <td>Exclusive Rights</td>
                      <td>
                        <strong>No</strong> — final sale
                      </td>
                      <td>Once exclusive rights are issued the beat leaves the store. No exceptions.</td>
                    </tr>
                    <tr>
                      <td>Studio booking — cancelled 24+ hours before the session</td>
                      <td>
                        <strong>Yes</strong> — deposit refunded or moved
                      </td>
                      <td>Choose a reschedule or a full deposit refund.</td>
                    </tr>
                    <tr>
                      <td>Studio booking — cancelled inside 24 hours or no-show</td>
                      <td>
                        <strong>No</strong>
                      </td>
                      <td>The slot was held for you and could not be re-let.</td>
                    </tr>
                    <tr>
                      <td>Studio booking — cancelled by the studio</td>
                      <td>
                        <strong>Yes</strong> — full refund
                      </td>
                      <td>Including any deposit, plus help finding a new slot.</td>
                    </tr>
                    <tr>
                      <td>Service fee</td>
                      <td>
                        <strong>Refunded with the order</strong>
                      </td>
                      <td>When we refund a purchase, the fee goes back with it.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ),
        },
        {
          id: "digital",
          title: "Beat licenses and download files",
          content: (
            <>
              <p>
                When you buy a license you get the files plus a license certificate immediately, and the beat (on a non-exclusive tier) stays
                available to other artists. Because the product is delivered instantly and cannot be returned, a completed download is normally
                non-refundable. That is standard practice for digital music licensing and it is why every beat page lets you hear the full preview
                before you pay.
              </p>
              <p>We will refund a license in full when:</p>
              <ul>
                <li>you were charged twice for the same order, or the same order was charged after a failed attempt;</li>
                <li>the payment succeeded but the files, download links or license certificate were never delivered and we cannot fix it;</li>
                <li>the delivered files are corrupt, silent or are not the beat you paid for; or</li>
                <li>applicable consumer law requires it.</li>
              </ul>
              <p>
                If you simply picked the wrong license tier, contact us within <strong>14 days</strong> — where the price difference is paid, we can
                usually upgrade or switch your license instead of refunding it.
              </p>
            </>
          ),
        },
        {
          id: "exclusive",
          title: "Exclusive rights are final",
          content: (
            <>
              <p>
                Exclusive Rights remove the beat from the store and end its availability to every other artist. That change happens at the moment
                of purchase and cannot be undone, so exclusive purchases are <strong>not refundable</strong>, including where you later decide the
                beat does not suit the project. Please preview carefully and, if you are unsure, message us before paying — we are happy to talk
                through whether exclusivity is the right step for your release.
              </p>
            </>
          ),
        },
        {
          id: "studio",
          title: "Studio bookings and deposits",
          content: (
            <>
              <ul>
                <li>
                  <strong>More than 24 hours before your session:</strong> reschedule free of charge, or cancel for a full refund of the deposit.
                </li>
                <li>
                  <strong>Less than 24 hours before your session:</strong> the deposit is retained, because the slot can no longer realistically
                  be re-let. You may send someone else in your place with our agreement.
                </li>
                <li>
                  <strong>No-show:</strong> the deposit is retained and the balance for the booked session may still be due where the full session
                  was held.
                </li>
                <li>
                  <strong>Cancelled by the studio:</strong> your deposit is refunded in full, or moved to a new slot, whichever you prefer — plus
                  priority booking for the next available time.
                </li>
                <li>
                  <strong>Work already completed:</strong> once recording, mixing or mastering work has been delivered, that portion is not
                  refundable. If something is wrong with the deliverable, tell us and we will fix it — unlimited reasonable revisions are included
                  in mixing and mastering.
                </li>
              </ul>
              <p>
                Deposits are applied to the session price; they are not an extra charge. The studio’s booking policy also applies:{" "}
                {settings.bookingPolicy}
              </p>
            </>
          ),
        },
        {
          id: "request",
          title: "How to request a refund",
          content: (
            <>
              <ol>
                <li>
                  Send us your <strong>order reference</strong> (it looks like <code>MB-XXXXXX</code> and appears on your receipt and order page).
                </li>
                <li>Tell us what happened, and attach a screenshot if a file or download link failed.</li>
                <li>
                  Use the <Link href="/contact">contact page</Link>, email{" "}
                  <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>, or call{" "}
                  <a href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}>{settings.contactPhone}</a>.
                </li>
              </ol>
              <p>
                We reply to every request within one business day and aim to make a decision within <strong>3 business days</strong> of receiving
                the details. If a fix is possible — a reissued download, a corrected file, a new session slot — we will always offer that first,
                and you are free to insist on the refund where you are entitled to one.
              </p>
            </>
          ),
        },
        {
          id: "timing",
          title: "How and when the money arrives",
          content: (
            <>
              <p>
                Approved refunds are sent back through Paystack, the same way you paid. Card refunds typically land in 5–10 business days; Mobile
                Money refunds usually settle within 1–3 business days, though the network can take longer. You will receive an email the moment
                the refund is processed, showing the amount and the transaction reference.
              </p>
              <p>
                Because the original transaction includes a service fee that covers payment processing, a refund returns{" "}
                <strong>the full amount you paid</strong> — license or deposit plus the fee — except where a partial refund is agreed (for example,
                a partially completed studio session).
              </p>
            </>
          ),
        },
        {
          id: "chargebacks",
          title: "Please talk to us before a chargeback",
          content: (
            <>
              <p>
                A chargeback takes weeks, freezes the order and costs both sides fees. If you think a charge is wrong, contact us first — most
                problems are a failed payment, a duplicate charge or a delivery email in a spam folder, and all of them are quicker to fix
                directly. We keep records of every delivery, license key and download, which we happily share to resolve a dispute.
              </p>
              <p>
                Filing a chargeback for files that were delivered and downloaded may result in the license being withdrawn and further orders
                being declined.
              </p>
            </>
          ),
        },
        {
          id: "consumer-law",
          title: "Your statutory rights",
          content: (
            <>
              <p>
                Nothing in this policy removes or replaces rights you have under the laws of Ghana, including the Sale of Goods Act and the
                consumer protections of the Electronic Transactions Act where they apply. Where the law gives you a stronger remedy than this
                policy does, the law wins.
              </p>
            </>
          ),
        },
      ]}
    >
      <LegalFaq
        items={[
          {
            q: "I downloaded the wrong license — can I swap it?",
            a: (
              <>
                Usually yes. Pay the difference and we upgrade your license and the certificate. Ask within 14 days through the{" "}
                <Link href="/contact">contact page</Link>.
              </>
            ),
          },
          {
            q: "My download link says it expired. Do I pay again?",
            a: <>No. Send us the order reference and we reissue the files free of charge, whenever you need them.</>,
          },
          {
            q: "I paid but did not get a receipt email.",
            a: (
              <>
                Check the spam folder first, then look up your order on the <Link href="/account">account page</Link> — or message us and we will
                resend it.
              </>
            ),
          },
          {
            q: "Can I get a refund because my song flopped?",
            a: <>No. A license is paid for the rights to use the beat, not for the performance of your release.</>,
          },
        ]}
      />
    </LegalPage>
  );
}
