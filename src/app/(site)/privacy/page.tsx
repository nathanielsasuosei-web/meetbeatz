import type { Metadata } from "next";
import Link from "next/link";
import { LegalFaq, LegalPage } from "@/components/legal-page";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Meetbeatz collects, uses, stores and protects your personal data when you buy a beat, book a studio session or contact the studio.",
};

export const dynamic = "force-dynamic";

const UPDATED = "2026-10-05";

export default async function PrivacyPage() {
  const settings = await getSettings();

  return (
    <LegalPage
      eyebrow="Legal · Privacy"
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <>
          This policy explains what {settings.siteName} collects when you browse the store, buy a license, book studio time or send us a message —
          and the choices you have. We keep it short because we only collect what a working beat store genuinely needs.
        </>
      }
      related={[
        { href: "/terms", label: "Terms & Conditions", description: "The rules that apply to purchases, licenses and bookings." },
        { href: "/refunds", label: "Refund Policy", description: "When a refund is possible and how to ask for one." },
        { href: "/contact", label: "Contact us", description: "Ask a question or request a copy of your data." },
      ]}
      sections={[
        {
          id: "controller",
          title: "Who is responsible for your data",
          content: (
            <>
              <p>
                {settings.siteName} ({settings.location}) is the data controller for the personal information described here. For anything on this
                page — or to exercise a right — write to <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a> or call{" "}
                <a href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}>{settings.contactPhone}</a>.
              </p>
              <p>
                Our payments are processed by <strong>Paystack</strong> and our website is hosted on infrastructure that may store data outside
                Ghana. See “Where your data goes” below.
              </p>
            </>
          ),
        },
        {
          id: "collect",
          title: "What we collect",
          content: (
            <>
              <ul>
                <li>
                  <strong>Details you give us.</strong> Your name, email address and phone number when you buy a license, book a session, create
                  an account or send a message — plus the song title, order reference and anything you type into a form.
                </li>
                <li>
                  <strong>Order and license records.</strong> What you bought, the license term, the price paid, the payment reference, the
                  license key and the files released to you. License certificates have to keep this information as proof of your rights.
                </li>
                <li>
                  <strong>Account credentials.</strong> If you create an account we store your email and a <em>hashed</em> password. We never see
                  or store your password in readable form.
                </li>
                <li>
                  <strong>Play and usage counts.</strong> An anonymous tally of how many times each beat preview is played, used to show
                  popularity on the store. It is not tied to your identity.
                </li>
                <li>
                  <strong>Technical basics.</strong> Standard server logs (IP address, browser, pages requested, timestamps) that keep the site
                  online and help us spot abuse or fraud.
                </li>
              </ul>
              <p>
                We do <strong>not</strong> ask for and do not want your card number, Mobile Money PIN or bank credentials — those go directly to
                Paystack and the mobile money network.
              </p>
            </>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          content: (
            <>
              <ul>
                <li>To deliver your files, license certificate and receipt by email, and to show your purchases in your account.</li>
                <li>To confirm and manage studio bookings, including reminders about your session time and deposit.</li>
                <li>To answer your questions and provide support, including replying to messages you send through the site.</li>
                <li>To keep records of who holds which license, which protects both you and us if a claim is ever made.</li>
                <li>To prevent fraud, verify payments and meet tax, accounting and legal obligations.</li>
                <li>To improve the store — understanding which genres and features artists use most.</li>
                <li>
                  To send occasional news or offers <em>only</em> where you have opted in. Every such email includes a one-click unsubscribe.
                </li>
              </ul>
              <p>
                We rely on performing our contract with you (delivering your purchase), your consent (marketing, non-essential cookies), our
                legitimate interests (fraud prevention, site security, improving the store) and legal obligation (tax and accounting records).
              </p>
            </>
          ),
        },
        {
          id: "payments",
          title: "Payments and Mobile Money",
          content: (
            <>
              <p>
                Card and Mobile Money payments are handled by <strong>Paystack</strong>, a licensed payment processor. When you pay, Paystack
                collects your payment details and shares only a transaction reference, the amount, the network used and the status with us. We
                store that reference alongside your order so we can prove payment and settle any dispute.
              </p>
              <p>
                Paystack acts as an independent controller of the payment data it collects; its own privacy policy governs that processing. We
                never receive your card number or Mobile Money PIN.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies, storage and advertising",
          content: (
            <>
              <p>
                The site uses a small number of strictly necessary cookies: a session cookie that keeps you signed in, and cookies that protect
                forms against cross-site request forgery. Blocking them stops parts of the site from working.
              </p>
              <p>
                We may also display advertising through <strong>Google AdSense</strong>. When advertising is enabled, Google and its partners may
                use cookies or device identifiers to show ads based on your visits to this and other sites. You can control personalised
                advertising in your{" "}
                <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">
                  Google Ads settings
                </a>
                , and manage cookies in your browser at any time. Where the law requires it, ad cookies are only set after consent.
              </p>
            </>
          ),
        },
        {
          id: "sharing",
          title: "Who we share it with",
          content: (
            <>
              <p>We do not sell your personal information. It is shared only with the services that make the store work:</p>
              <ul>
                <li>
                  <strong>Paystack</strong> — payments, refunds and settlement.
                </li>
                <li>
                  <strong>Email delivery providers</strong> (for example our SMTP or transactional email service) — so your files, licenses and
                  receipts reach your inbox.
                </li>
                <li>
                  <strong>Hosting and database providers</strong> — the servers that store the store catalogue, accounts and orders.
                </li>
                <li>
                  <strong>Analytics and advertising partners</strong> — only where enabled on this site, and only for the purposes described
                  above.
                </li>
                <li>
                  <strong>Authorities</strong> — where we are legally required to disclose information, or where disclosure is necessary to
                  investigate fraud or protect our rights.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "transfer",
          title: "Where your data goes",
          content: (
            <>
              <p>
                Some of our service providers store data on servers outside Ghana, including in the European Union and the United States. Where
                personal data leaves Ghana we rely on the provider’s contractual safeguards and the protections required by the Data Protection
                Act, 2012 (Act 843) and, where it applies, the GDPR.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          content: (
            <>
              <ul>
                <li>
                  <strong>Orders, licenses and receipts:</strong> kept for as long as the license is valid and for the period tax and accounting
                  law requires afterwards — usually six years. A license certificate may need to be produced years later.
                </li>
                <li>
                  <strong>Account details:</strong> until you ask us to delete the account, after which the login is removed and only the records
                  tied to your orders stay.
                </li>
                <li>
                  <strong>Messages and enquiries:</strong> up to two years after the conversation ends, so we can keep the history of what was
                  agreed.
                </li>
                <li>
                  <strong>Server logs:</strong> a short rolling window, typically 30 days.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          content: (
            <>
              <p>
                Under the Data Protection Act, 2012 (Act 843) and, where it applies to you, the GDPR, you can ask us to:
              </p>
              <ul>
                <li>confirm what personal data we hold about you and give you a copy;</li>
                <li>correct anything inaccurate or incomplete;</li>
                <li>delete data we no longer need — noting that license and payment records may have to be kept by law;</li>
                <li>restrict or object to certain processing, including direct marketing at any time;</li>
                <li>withdraw consent you previously gave, without affecting what was done before; and</li>
                <li>receive your data in a portable format, or have it sent to another provider where that is technically possible.</li>
              </ul>
              <p>
                Email <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a> and we will respond within 30 days. If you are not
                satisfied with our answer you can complain to the Data Protection Commission of Ghana, or — if you are in the EU/UK — your local
                supervisory authority.
              </p>
            </>
          ),
        },
        {
          id: "security",
          title: "How we protect it",
          content: (
            <>
              <p>
                Passwords are stored as one-way hashes, traffic to the site is encrypted in transit, and access to orders and customer data is
                limited to studio administrators. Files are served through signed download links rather than guessable public paths.
              </p>
              <p>
                No system is perfect. If a breach ever affects your personal data, we will notify you and the relevant authority as required by
                law.
              </p>
            </>
          ),
        },
        {
          id: "children",
          title: "Children",
          content: (
            <>
              <p>
                The store and studio are meant for artists old enough to enter a contract. We do not knowingly collect personal data from
                children under 13. If you believe a child has given us information, contact us and we will delete it.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes to this policy",
          content: (
            <>
              <p>
                We may update this policy as the store changes — for example when a new payment method or feature is added. The revision date at
                the top of the page always shows the current version, and material changes will be announced on the site or by email where we
                have your address.
              </p>
            </>
          ),
        },
      ]}
    >
      <LegalFaq
        items={[
          {
            q: "Do you keep my card or Mobile Money details?",
            a: (
              <>
                No. Payments are handled entirely by Paystack. We only receive a reference, the amount and the status of the transaction.
              </>
            ),
          },
          {
            q: "Can I delete my account but keep my licenses?",
            a: (
              <>
                Yes. Ask us to close the account and we remove your login details while keeping the order and license records that prove your
                rights. Re-downloads can still be arranged through <Link href="/contact">the contact page</Link>.
              </>
            ),
          },
          {
            q: "Will you email me marketing if I buy a beat?",
            a: <>Only if you tick the opt-in. Order receipts, license certificates and delivery emails are always sent because they are part of the purchase.</>,
          },
          {
            q: "How do I stop personalised ads?",
            a: (
              <>
                Use your{" "}
                <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">
                  Google Ads settings
                </a>{" "}
                or the cookie controls in your browser. The store works the same either way.
              </>
            ),
          },
        ]}
      />
    </LegalPage>
  );
}
