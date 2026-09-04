"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { money } from "@/lib/format";

export type LicenseTypeLite = {
  id: number;
  name: string;
  defaultPrice: number;
  deliverables: string;
  isExclusive: boolean;
};

export type BeatFormValues = {
  id: number;
  title: string;
  genre: string;
  mood: string;
  bpm: number | null;
  musicalKey: string;
  tags: string;
  description: string;
  isPublished: boolean;
  isFeatured: boolean;
  cover: string | null;
  hasPreview: boolean;
  hasMp3: boolean;
  hasWav: boolean;
  hasStems: boolean;
  prices: Record<number, { enabled: boolean; price: number }>;
};

const FILE_FIELDS: { key: "cover" | "preview" | "mp3" | "wav" | "stems"; label: string; hint: string; accept: string }[] = [
  { key: "cover", label: "Cover art", hint: "JPG/PNG/WebP, square (e.g. 1500×1500)", accept: "image/jpeg,image/png,image/webp" },
  { key: "preview", label: "Tagged preview (optional)", hint: "MP3 with your producer tag — streamed publicly on the site. If empty, the MP3 below is used.", accept: ".mp3,.wav,.m4a,.ogg" },
  { key: "mp3", label: "Untagged MP3 (delivered to buyers)", hint: "320kbps MP3. Required unless you upload a WAV.", accept: ".mp3,.m4a,.wav" },
  { key: "wav", label: "WAV master (optional)", hint: "24-bit WAV for Premium/Unlimited/Exclusive buyers.", accept: ".wav,.aif,.aiff,.flac,.zip" },
  { key: "stems", label: "Track stems ZIP (optional)", hint: "Zipped stems for Unlimited/Exclusive buyers.", accept: ".zip,.rar,.7z" },
];

export function BeatForm({ licenseTypes, beat, currency }: { licenseTypes: LicenseTypeLite[]; beat: BeatFormValues | null; currency: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<number, { enabled: boolean; price: number }>>(() => {
    const init: Record<number, { enabled: boolean; price: number }> = {};
    for (const lt of licenseTypes) {
      init[lt.id] = beat?.prices[lt.id] ?? { enabled: !lt.deliverables.includes("stems"), price: lt.defaultPrice };
    }
    return init;
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    for (const lt of licenseTypes) {
      fd.set(`enabled_${lt.id}`, prices[lt.id]?.enabled ? "1" : "0");
      fd.set(`price_${lt.id}`, String(prices[lt.id]?.price ?? 0));
    }
    const xhr = new XMLHttpRequest();
    xhr.open(beat ? "PATCH" : "POST", beat ? `/api/admin/beats/${beat.id}` : "/api/admin/beats");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      let json: { error?: string; id?: number } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        router.push(`/admin/beats?msg=${encodeURIComponent(beat ? "Beat updated." : "Beat uploaded and live.")}`);
        router.refresh();
      } else {
        setError(json.error ?? `Upload failed (${xhr.status}).`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Network error during upload. Please try again.");
    };
    setProgress(0);
    xhr.send(fd);
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <div className="card space-y-4 p-5">
          <h2 className="font-bold">Beat details</h2>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="field" defaultValue={beat?.title ?? ""} required placeholder="e.g. Midnight in Osu" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="genre">Genre</label>
              <input id="genre" name="genre" className="field" defaultValue={beat?.genre ?? ""} placeholder="Afrobeats, Drill, Highlife…" list="genre-list" />
              <datalist id="genre-list">
                {["Afrobeats", "Asakaa / Drill", "Highlife", "Amapiano", "Hip Hop", "Trap", "R&B", "Dancehall", "Gospel", "Afro-fusion"].map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="mood">Mood</label>
              <input id="mood" name="mood" className="field" defaultValue={beat?.mood ?? ""} placeholder="Dark, Smooth, Uplifting…" />
            </div>
            <div>
              <label className="label" htmlFor="bpm">BPM</label>
              <input id="bpm" name="bpm" type="number" min={40} max={300} className="field" defaultValue={beat?.bpm ?? ""} placeholder="102" />
            </div>
            <div>
              <label className="label" htmlFor="musicalKey">Key</label>
              <input id="musicalKey" name="musicalKey" className="field" defaultValue={beat?.musicalKey ?? ""} placeholder="F# minor" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="tags">Tags (comma separated)</label>
            <input id="tags" name="tags" className="field" defaultValue={beat?.tags ?? ""} placeholder="wizkid type beat, smooth, log drums" />
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea id="description" name="description" className="field min-h-28" defaultValue={beat?.description ?? ""} placeholder="What makes this beat special? Who is it for?" />
          </div>
          <div className="flex flex-wrap gap-6 pt-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isPublished" defaultChecked={beat?.isPublished ?? true} className="h-4 w-4 accent-acid" /> Published (visible in store)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isFeatured" defaultChecked={beat?.isFeatured ?? false} className="h-4 w-4 accent-acid" /> Featured on home page
            </label>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-bold">Licenses & pricing</h2>
          <p className="mt-1 text-xs text-muted">
            Tick the licenses available for this beat and set the price in {currency}. Customers pay this price plus the service fee; you receive the full
            beat price.
          </p>
          <div className="mt-4 space-y-2">
            {licenseTypes.map((lt) => {
              const p = prices[lt.id];
              return (
                <div key={lt.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${p?.enabled ? "border-acid/40 bg-acid/5" : "border-line"}`}>
                  <label className="flex min-w-40 flex-1 items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-acid"
                      checked={p?.enabled ?? false}
                      onChange={(e) => setPrices((s) => ({ ...s, [lt.id]: { enabled: e.target.checked, price: s[lt.id]?.price ?? lt.defaultPrice } }))}
                    />
                    {lt.name}
                    <span className="text-[10px] font-normal uppercase tracking-wider text-muted">{lt.deliverables.replace(/,/g, " + ")}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{currency}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="field !w-32"
                      value={p?.price ?? lt.defaultPrice}
                      onChange={(e) => setPrices((s) => ({ ...s, [lt.id]: { enabled: s[lt.id]?.enabled ?? true, price: parseFloat(e.target.value) || 0 } }))}
                      disabled={!p?.enabled}
                    />
                  </div>
                  <span className="w-28 text-right text-xs text-muted">{p?.enabled ? money(p.price, currency) : "Not offered"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card space-y-4 p-5">
          <h2 className="font-bold">Files</h2>
          {beat?.cover && (
            <div className="h-28 w-28 overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={beat.cover} alt="Current cover" className="h-full w-full object-cover" />
            </div>
          )}
          {FILE_FIELDS.map((f) => {
            const has =
              f.key === "cover" ? !!beat?.cover : f.key === "preview" ? beat?.hasPreview : f.key === "mp3" ? beat?.hasMp3 : f.key === "wav" ? beat?.hasWav : beat?.hasStems;
            return (
              <div key={f.key}>
                <label className="label" htmlFor={`file-${f.key}`}>
                  {f.label} {beat && has && <span className="ml-1 normal-case text-ok">· uploaded (choose a file to replace)</span>}
                </label>
                <input id={`file-${f.key}`} name={f.key} type="file" accept={f.accept} className="field file:mr-3 file:rounded-full file:border-0 file:bg-acid file:px-3 file:py-1 file:text-xs file:font-bold file:text-ink" />
                <p className="mt-1 text-[11px] text-muted">{f.hint}</p>
              </div>
            );
          })}
        </div>

        {progress !== null && (
          <div className="card p-5">
            <p className="text-sm font-semibold">Uploading… {progress}%</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-acid transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">Large WAV files can take a minute. Keep this tab open.</p>
          </div>
        )}
        {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
        <button type="submit" className="btn-primary w-full !py-3.5" disabled={progress !== null}>
          {beat ? "Save changes" : "Upload beat"}
        </button>
      </div>
    </form>
  );
}
