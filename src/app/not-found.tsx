import Image from "next/image";
import Link from "next/link";

/**
 * Global 404. Unmatched URLs land here, so it keeps the same liquid-glass
 * styling and — more importantly — gives people somewhere to go instead of a
 * dead end.
 */
const LINKS = [
  { href: "/beats", label: "Beat store", hint: "Preview and license original beats" },
  { href: "/sound-kits", label: "Sound Kits", hint: "Free downloads for your next session" },
  { href: "/studio", label: "Studio bookings", hint: "Recording, mixing and mastering" },
  { href: "/contact", label: "Contact", hint: "Ask a question or report a problem" },
  { href: "/licensing", label: "Licensing guide", hint: "Compare all four license tiers" },
  { href: "/", label: "Home", hint: "Back to the start" },
];

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-4 py-16 sm:px-6">
      <div className="glass-strong w-full rounded-3xl p-6 text-center sm:p-10">
        <Image
          src="/images/logo.png"
          alt="Meetbeatz logo"
          width={72}
          height={72}
          className="mx-auto h-16 w-16 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_8px_24px_-6px_rgba(0,0,0,0.5)]"
        />
        <p className="eyebrow mt-6">Error 404</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">That page went off-beat.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-cream/80">
          The link you followed does not exist any more — or never did. Nothing was lost: your orders and licenses are still on your account page.
        </p>

        <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="card group flex flex-col p-4">
              <span className="font-bold group-hover:text-acid">{l.label}</span>
              <span className="mt-0.5 text-xs text-muted">{l.hint}</span>
            </Link>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/beats" className="btn-primary !px-6 !py-3">
            Browse beats
          </Link>
          <Link href="/account" className="btn-ghost !px-6 !py-3">
            My account
          </Link>
        </div>
      </div>
    </main>
  );
}
