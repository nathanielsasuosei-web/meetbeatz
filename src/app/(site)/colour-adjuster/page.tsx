import type { Metadata } from "next";
import Link from "next/link";
import { ColourAdjuster } from "@/components/colour-adjuster";
import { PaletteIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Colour adjuster",
  description:
    "Grade your cover artwork in the browser — exposure, contrast, temperature, grain and vignette — and export a store-ready 3000 × 3000. Nothing is uploaded.",
};
export const dynamic = "force-dynamic";

const STORE_SPECS = [
  ["Spotify / Apple Music", "3000 × 3000px, square, JPEG or PNG, no blur or pixelation"],
  ["File size", "Under 20 MB; most stores reject anything above 650 KB for small artwork"],
  ["Text on the cover", "Optional, but it must match the release — no store logos or URLs"],
  ["Colour space", "sRGB. Anything wider (Display P3, CMYK) shifts when a store converts it"],
];

const FAQ = [
  {
    q: "Is my artwork uploaded anywhere?",
    a: "No. Every adjustment is drawn on a canvas in your own browser and the download is generated there too. Nothing is sent to a server, which is the point when the cover belongs to a song nobody has heard yet.",
  },
  {
    q: "Why does the export look slightly different from the preview?",
    a: "It should not. The preview and the export run through the same rendering code; the only differences are resolution-dependent effects (softness and grain), which scale with the output so they read the same at 3000px as they do on screen.",
  },
  {
    q: "My artwork is not square. What happens?",
    a: "The preview keeps your aspect ratio. When you export a square size the image is centre-cropped to fill it, which is what the stores require — check the framing before you download, and re-crop at source if the subject sits off-centre.",
  },
  {
    q: "Can you grade it for me instead?",
    a: "Yes — that is part of a release through the distribution service. Submit the artwork with your song and the studio will check it against store specs before the release goes out.",
  },
];

export default async function ColourAdjusterPage() {
  const settings = await getSettings();

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="liquid-orbs absolute inset-0" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5">
            <PaletteIcon className="h-4 w-4 text-acid" />
            <p className="eyebrow !tracking-[0.18em]">Free tool · runs in your browser</p>
          </div>
          <h1 className="display mt-4 text-5xl md:text-7xl">Colour adjuster.</h1>
          <p className="mt-5 max-w-2xl text-base text-cream/80">
            Grade your cover artwork before it goes out — exposure, contrast, temperature, fade, grain and vignette — then
            export a square the streaming stores will accept. Your file never leaves your device.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/distribution" className="btn-ghost">
              Distribute the finished song
            </Link>
            <Link href="/studio" className="btn-ghost">
              Book a session
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <ColourAdjuster siteName={settings.siteName} />
      </section>

      <section className="glass-section">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Artwork the stores accept</p>
            <ul className="glass mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl text-sm">
              {STORE_SPECS.map(([label, value]) => (
                <li key={label} className="px-4 py-3">
                  <p className="font-semibold">{label}</p>
                  <p className="mt-0.5 text-muted">{value}</p>
                </li>
              ))}
            </ul>
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
        </div>
      </section>
    </>
  );
}
