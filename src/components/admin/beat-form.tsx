"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { money } from "@/lib/format";
import {
  ALLOWED_EXT,
  MAX_UPLOAD_BYTES,
  assertUploadAllowed,
  formatBytes,
  type UploadKind,
} from "@/lib/upload-rules";

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

type FileSlot = { key: "cover" | "preview" | "mp3" | "wav" | "stems"; kind: UploadKind; label: string; hint: string };

const LIMIT = formatBytes(MAX_UPLOAD_BYTES);

const FILE_FIELDS: FileSlot[] = [
  {
    key: "cover",
    kind: "covers",
    label: "Cover art",
    hint: `JPG/PNG/WebP, square (e.g. 1500×1500) · up to ${LIMIT}`,
  },
  {
    key: "preview",
    kind: "previews",
    label: "Tagged preview (optional)",
    hint: "MP3 with your producer tag — streamed publicly on the site. If empty, the MP3 below is used.",
  },
  {
    key: "mp3",
    kind: "mp3",
    label: "Untagged MP3 (delivered to buyers)",
    hint: "320kbps MP3. Required unless you upload a WAV.",
  },
  {
    key: "wav",
    kind: "wav",
    label: "WAV master (optional)",
    hint: `24-bit WAV for Premium/Unlimited/Exclusive buyers · up to ${LIMIT}`,
  },
  {
    key: "stems",
    kind: "stems",
    label: "Track stems ZIP (optional)",
    hint: `Zipped stems for Unlimited/Exclusive buyers · up to ${LIMIT}`,
  },
];

function readJson(text: string): { error?: string; [key: string]: unknown } {
  try {
    return JSON.parse(text) as { error?: string };
  } catch {
    return {};
  }
}

/**
 * Sends one part of a file.
 *
 * Files are stored in the database, so they cannot be posted as one multipart
 * form: serverless hosts (Vercel included) reject a request body over 4.5 MB,
 * which every WAV and stem zip exceeds. The server hands back a part size, and
 * each part goes up as its own request — which is also what makes the progress
 * bar below real rather than decorative.
 */
function putChunk(sessionId: number, index: number, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/admin/uploads/${sessionId}?index=${index}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(readJson(xhr.responseText).error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and try again."));
    xhr.send(blob);
  });
}

/** One retry-friendly send per part: mobile connections drop a 4 MB request often enough. */
async function putChunkWithRetry(
  sessionId: number,
  index: number,
  blob: Blob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await putChunk(sessionId, index, blob, onProgress);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed.");
}

export function BeatForm({ licenseTypes, beat, currency }: { licenseTypes: LicenseTypeLite[]; beat: BeatFormValues | null; currency: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Files already stored by the server, keyed by slot+file, so a retry after a
  // failed submit does not re-send a 200 MB master over a slow connection.
  const storedFiles = useRef(new Map<string, string>());
  const activeSession = useRef<number | null>(null);
  const [prices, setPrices] = useState<Record<number, { enabled: boolean; price: number }>>(() => {
    const init: Record<number, { enabled: boolean; price: number }> = {};
    for (const lt of licenseTypes) {
      init[lt.id] = beat?.prices[lt.id] ?? { enabled: !lt.deliverables.includes("stems"), price: lt.defaultPrice };
    }
    return init;
  });

  function fileKey(slot: FileSlot, file: File): string {
    return `${slot.key}:${file.name}:${file.size}:${file.lastModified}`;
  }

  async function uploadFile(file: File, kind: UploadKind, onProgress: (sentInFile: number) => void): Promise<string> {
    const start = await fetch("/api/admin/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, kind, size: file.size }),
    });
    const info = readJson(await start.text());
    const sessionId = Number(info.id);
    const chunkSize = Number(info.chunkSize);
    if (!start.ok || !sessionId || !chunkSize) {
      throw new Error(info.error ?? `Could not start the upload (${start.status}).`);
    }
    activeSession.current = sessionId;

    let sent = 0;
    for (let index = 0; sent < file.size; index++) {
      const blob = file.slice(sent, Math.min(sent + chunkSize, file.size));
      const offset = sent;
      await putChunkWithRetry(sessionId, index, blob, (loaded) => onProgress(offset + loaded));
      sent += blob.size;
      onProgress(sent);
    }

    const done = await fetch(`/api/admin/uploads/${sessionId}`, { method: "POST" });
    const finished = readJson(await done.text());
    const path = typeof finished.path === "string" ? finished.path : "";
    if (!done.ok || !path) throw new Error(finished.error ?? "The file uploaded but could not be saved. Please try again.");
    activeSession.current = null;
    return path;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;

    const chosen: { slot: FileSlot; file: File }[] = [];
    for (const slot of FILE_FIELDS) {
      const field = form.elements.namedItem(slot.key);
      const file = field instanceof HTMLInputElement ? field.files?.[0] : undefined;
      if (file) chosen.push({ slot, file });
    }
    try {
      for (const { slot, file } of chosen) assertUploadAllowed(slot.kind, file.name, file.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file cannot be uploaded.");
      return;
    }

    const totalBytes = chosen.reduce((sum, { file }) => sum + file.size, 0);
    const paths: Record<string, string> = {};
    let uploadedBytes = 0;

    try {
      if (totalBytes > 0) setProgress(0);
      for (const { slot, file } of chosen) {
        const key = fileKey(slot, file);
        const already = storedFiles.current.get(key);
        if (already) {
          paths[`${slot.key}Path`] = already;
          uploadedBytes += file.size;
          continue;
        }
        setProgressLabel(`Uploading ${file.name} (${formatBytes(file.size)})`);
        const before = uploadedBytes;
        const path = await uploadFile(file, slot.kind, (sentInFile) => {
          const done = before + Math.min(sentInFile, file.size);
          setProgress(Math.min(99, Math.round((done / totalBytes) * 100)));
        });
        storedFiles.current.set(key, path);
        paths[`${slot.key}Path`] = path;
        uploadedBytes += file.size;
        setProgress(Math.round((uploadedBytes / totalBytes) * 100));
      }

      if (totalBytes > 0) setProgressLabel("Saving beat…");
      const fd = new FormData(form);
      // The raw <input type="file"> entries never go to the server; only the
      // storage paths of the files that finished uploading do.
      for (const slot of FILE_FIELDS) fd.delete(slot.key);
      for (const [key, value] of Object.entries(paths)) fd.set(key, value);
      for (const lt of licenseTypes) {
        fd.set(`enabled_${lt.id}`, prices[lt.id]?.enabled ? "1" : "0");
        fd.set(`price_${lt.id}`, String(prices[lt.id]?.price ?? 0));
      }

      const res = await fetch(beat ? `/api/admin/beats/${beat.id}` : "/api/admin/beats", {
        method: beat ? "PATCH" : "POST",
        body: fd,
      });
      const json = readJson(await res.text());
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status}).`);

      router.push(`/admin/beats?msg=${encodeURIComponent(beat ? "Beat updated." : "Beat uploaded and live.")}`);
      router.refresh();
    } catch (err) {
      // Cancel only the part-uploaded file; anything already complete stays
      // usable, so the admin can fix the problem and submit again.
      const session = activeSession.current;
      if (session) {
        activeSession.current = null;
        void fetch(`/api/admin/uploads/${session}`, { method: "DELETE" }).catch(() => {});
      }
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
      setProgressLabel("");
    }
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
                <input
                  id={`file-${f.key}`}
                  name={f.key}
                  type="file"
                  accept={ALLOWED_EXT[f.kind].join(",")}
                  className="field file:mr-3 file:rounded-full file:border-0 file:bg-acid file:px-3 file:py-1 file:text-xs file:font-bold file:text-ink"
                />
                <p className="mt-1 text-[11px] text-muted">{f.hint}</p>
              </div>
            );
          })}
          <p className="text-[11px] text-muted">
            Large files are uploaded in parts, so a 200 MB stem zip works over a normal connection. Keep this tab open until it finishes.
          </p>
        </div>

        {progress !== null && (
          <div className="card p-5">
            <p className="text-sm font-semibold">Uploading… {progress}%</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-acid transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">{progressLabel || "Large WAV files can take a minute. Keep this tab open."}</p>
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
