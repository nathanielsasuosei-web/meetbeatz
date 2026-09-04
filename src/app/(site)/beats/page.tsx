import Link from "next/link";
import type { Metadata } from "next";
import { BeatGrid } from "@/components/beat-card";
import { listBeats, listGenres } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Beat Store" };

export default async function BeatsPage({ searchParams }: { searchParams: Promise<{ q?: string; genre?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const genre = (params.genre ?? "").trim();
  const [settings, beats, genres] = await Promise.all([getSettings(), listBeats({ q, genre }), listGenres()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Beat store</p>
          <h1 className="display mt-2 text-5xl md:text-6xl">All beats</h1>
          <p className="mt-3 max-w-lg text-sm text-muted">
            Preview in full, choose a license, pay with Mobile Money. {beats.length} beat{beats.length === 1 ? "" : "s"} available.
          </p>
        </div>
        <form className="flex w-full gap-2 md:w-auto" action="/beats" method="get">
          {genre && <input type="hidden" name="genre" value={genre} />}
          <input name="q" defaultValue={q} placeholder="Search title, genre, mood, key…" className="field md:w-80" />
          <button type="submit" className="btn-primary shrink-0">
            Search
          </button>
        </form>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href={q ? `/beats?q=${encodeURIComponent(q)}` : "/beats"} className={`badge !px-3.5 !py-1.5 !text-xs ${!genre ? "!border-acid !bg-acid !text-ink" : "hover:border-cream/40"}`}>
          All genres
        </Link>
        {genres.map((g) => (
          <Link
            key={g}
            href={`/beats?genre=${encodeURIComponent(g)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`badge !px-3.5 !py-1.5 !text-xs ${genre === g ? "!border-acid !bg-acid !text-ink" : "hover:border-cream/40"}`}
          >
            {g}
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <BeatGrid beats={beats} currency={settings.currency} />
      </div>
    </div>
  );
}
