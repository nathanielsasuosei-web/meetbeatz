"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckoutForm } from "./checkout-form";
import { uploadArtistFile } from "@/lib/client-upload";
import { money, round2 } from "@/lib/format";
import { DEFAULT_STORES, DISTRIBUTION_STORES } from "@/lib/release";
import { ALLOWED_EXT, allowedExtensionsLabel, formatBytes, type UploadKind } from "@/lib/upload-rules";

/**
 * The distribution submission: pick a tier, describe the release, upload the
 * artwork and the master, then pay.
 *
 * Files upload as soon as they are chosen, in the same proxy-safe chunks the
 * admin beat form uses, so a 60 MB master is already in storage before the
 * payment redirect — and if the payment is abandoned the producer still has the
 * files attached to an `awaiting_payment` release rather than nothing.
 */

export type PlanOption = {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  tracks: number;
  price: number;
  turnaroundDays: number;
  royaltyPercent: number;
};

type SlotState = {
  path: string;
  name: string;
  size: number;
  progress: number;
  status: string;
  error: string;
};

const EMPTY_SLOT: SlotState = { path: "", name: "", size: 0, progress: 0, status: "", error: "" };

function FileSlot({
  label,
  hint,
  kind,
  accept,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  kind: UploadKind;
  accept: string;
  value: SlotState;
  onChange: (next: SlotState) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = value.progress > 0 && value.progress < 100;

  const pick = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      onChange({ ...EMPTY_SLOT, name: file.name, size: file.size, progress: 0, status: `Starting ${file.name}…` });
      try {
        const path = await uploadArtistFile(
          file,
          kind,
          (sent, total) => onChange({ path: "", name: file.name, size: file.size, progress: Math.round((sent / total) * 100), status: "", error: "" }),
          (status) => onChange({ path: "", name: file.name, size: file.size, progress: 0, status, error: "" }),
        );
        onChange({ path, name: file.name, size: file.size, progress: 100, status: "Uploaded", error: "" });
      } catch (err) {
        onChange({ ...EMPTY_SLOT, name: file.name, size: file.size, error: err instanceof Error ? err.message : "The upload failed." });
      }
    },
    [kind, onChange],
  );

  return (
    <div>
      <p className="label">{label}</p>
      <p className="mb-2 text-[11px] text-muted">{hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()} disabled={disabled || busy}>
          {value.path ? "Replace file" : busy ? "Uploading…" : "Choose file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {value.name && (
          <span className="min-w-0 text-xs text-muted">
            <span className="block max-w-[16rem] truncate font-mono text-cream/80">{value.name}</span>
            {formatBytes(value.size)}
            {value.path ? " · stored" : ""}
          </span>
        )}
      </div>
      {busy && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={value.progress} aria-valuemin={0} aria-valuemax={100}>
          <span className="block h-full rounded-full bg-acid transition-[width]" style={{ width: `${value.progress}%` }} />
        </div>
      )}
      {value.status && !value.error && <p className="mt-1.5 text-[11px] text-muted">{value.status}</p>}
      {value.error && (
        <p className="mt-1.5 text-[11px] text-danger" role="alert">
          {value.error}
        </p>
      )}
      {value.path && <p className="mt-1.5 text-[11px] text-ok">Ready — {formatBytes(value.size)} stored.</p>}
    </div>
  );
}

export function DistributionForm({
  plans,
  feePercent,
  currency,
  account,
}: {
  plans: PlanOption[];
  feePercent: number;
  currency: string;
  account: { name: string; email: string } | null;
}) {
  const [planId, setPlanId] = useState<number>(plans[0]?.id ?? 0);
  const plan = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId]);

  const [artistName, setArtistName] = useState(account?.name ?? "");
  const [releaseTitle, setReleaseTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [stores, setStores] = useState<string[]>(DEFAULT_STORES.slice());
  const [explicit, setExplicit] = useState(false);
  const [isrc, setIsrc] = useState("");
  const [upc, setUpc] = useState("");
  const [notes, setNotes] = useState("");
  const [artwork, setArtwork] = useState<SlotState>(EMPTY_SLOT);
  const [master, setMaster] = useState<SlotState>(EMPTY_SLOT);

  // A release date in the past is rejected by every store, so the picker starts
  // two weeks out — roughly the shortest realistic runway.
  const minDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 14);
    return d.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    if (account?.name) setArtistName((current) => current || account.name);
  }, [account?.name]);

  const toggleStore = (slug: string) =>
    setStores((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]));

  const price = plan ? plan.price : 0;
  const fee = round2((price * feePercent) / 100);
  const total = round2(price + fee);
  const ready = Boolean(plan && artwork.path && master.path && releaseTitle.trim() && artistName.trim() && stores.length);

  const blockers: string[] = [];
  if (!account) blockers.push("sign in");
  if (!master.path) blockers.push("upload the audio");
  if (!artwork.path) blockers.push("upload the artwork");
  if (!stores.length) blockers.push("pick at least one store");

  // The upload slots are the reason an account is required: they are the only
  // authenticated write path an artist has, and anonymous uploads would be free
  // unattributed storage.
  if (!account) {
    return (
      <div className="card p-8 text-center">
        <p className="text-3xl">🔐</p>
        <h2 className="mt-3 text-2xl font-bold">Sign in to submit a release</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Your master and artwork are uploaded to your account before you pay, so the studio always has the files even if
          the payment is interrupted — and the release follows you into your account afterwards. Creating an account is
          free and takes a minute.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/account/register" className="btn-primary">
            Create a free account
          </Link>
          <Link href="/account/login" className="btn-ghost">
            I already have one
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
      <div className="space-y-6">
        <div className="card p-5">
          <p className="label">1 · Tier</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {plans.map((option) => {
              const selected = option.id === plan?.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPlanId(option.id)}
                  aria-pressed={selected}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected ? "border-acid/60 bg-acid/10" : "border-white/12 bg-white/[0.02] hover:border-white/30"
                  }`}
                >
                  <p className="font-bold">{option.name}</p>
                  <p className="display mt-1 text-2xl text-acid">{money(option.price, currency)}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">
                    {option.tracks} track{option.tracks > 1 ? "s" : ""} · {option.turnaroundDays} days
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    You keep {100 - option.royaltyPercent}% of royalties
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <p className="label">2 · The release</p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="artistName">Artist name (as it should appear)</label>
              <input id="artistName" className="field" value={artistName} onChange={(e) => setArtistName(e.target.value)} required maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="releaseTitle">Release title</label>
              <input id="releaseTitle" className="field" value={releaseTitle} onChange={(e) => setReleaseTitle(e.target.value)} required maxLength={160} />
            </div>
            <div>
              <label className="label" htmlFor="genre">Genre</label>
              <input id="genre" className="field" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Afrobeats" maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="releaseDate">Requested release date</label>
              <input id="releaseDate" type="date" className="field" value={releaseDate} min={minDate} onChange={(e) => setReleaseDate(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted">Leave blank for &ldquo;as soon as it is ready&rdquo;.</p>
            </div>
            <div>
              <label className="label" htmlFor="isrc">ISRC (optional)</label>
              <input id="isrc" className="field font-mono" value={isrc} onChange={(e) => setIsrc(e.target.value)} placeholder="GHMB12500001" maxLength={24} />
            </div>
            <div>
              <label className="label" htmlFor="upc">UPC / EAN (optional)</label>
              <input id="upc" className="field font-mono" value={upc} onChange={(e) => setUpc(e.target.value)} placeholder="12–14 digits" maxLength={24} />
            </div>
            <div className="sm:col-span-2">
              <span className="label">Deliver to</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {DISTRIBUTION_STORES.map((store) => {
                  const on = stores.includes(store.slug);
                  return (
                    <button
                      key={store.slug}
                      type="button"
                      onClick={() => toggleStore(store.slug)}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        on ? "border-acid/60 bg-acid/15 text-cream" : "border-white/12 bg-white/[0.02] text-muted hover:text-cream"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {store.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-start gap-2.5 text-sm text-muted sm:col-span-2" htmlFor="explicit">
              <input id="explicit" type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-acid)]" checked={explicit} onChange={(e) => setExplicit(e.target.checked)} />
              <span>
                <span className="block font-semibold text-cream">Explicit content</span>
                Stores will label the release. Getting this wrong is the most common reason a delivery is bounced back.
              </span>
            </label>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="notes">Anything the studio should know</label>
              <textarea id="notes" className="field min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Featured artists, songwriter splits, a cover version, a deadline…" />
            </div>
          </div>
        </div>

        <div className="card space-y-5 p-5">
          <p className="label">3 · Files</p>
          <FileSlot
            label="Finished audio"
            hint={`WAV or FLAC, 16/24-bit, 44.1 kHz or higher · ${allowedExtensionsLabel("masters")}`}
            kind="masters"
            accept={ALLOWED_EXT.masters.join(",")}
            value={master}
            onChange={setMaster}
            disabled={false}
          />
          <FileSlot
            label="Cover artwork"
            hint={`Square, at least 1400 × 1400 (3000 × 3000 is best) · ${allowedExtensionsLabel("artwork")}`}
            kind="artwork"
            accept={ALLOWED_EXT.artwork.join(",")}
            value={artwork}
            onChange={setArtwork}
            disabled={false}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            <Link href="/colour-adjuster" className="btn-ghost">
              Grade the artwork first
            </Link>
            <p className="text-[11px] text-muted">
              Free browser tool — export a 3000 × 3000 square the stores accept.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="card p-5">
          <p className="label">Summary</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Tier</dt>
              <dd className="font-semibold">{plan?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Release</dt>
              <dd className="max-w-[12rem] truncate font-semibold">{releaseTitle || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Stores</dt>
              <dd className="text-right font-semibold">{stores.length || 0}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
              <dt className="text-muted">Distribution</dt>
              <dd>{money(price, currency)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Service fee ({feePercent}%)</dt>
              <dd>{money(fee, currency)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-white/10 pt-2 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="display text-acid">{money(total, currency)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            One payment per release, no annual fee. Royalties are reported to you monthly and paid to the account you
            nominate.
          </p>
        </div>

        <div className="card p-5">
          <p className="label">4 · Pay</p>
          {!ready && (
            <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Still to do: {blockers.filter((b) => b !== "sign in").join(", ") || "finish the details above"}.
            </p>
          )}
          <CheckoutForm
            endpoint="/api/checkout/distribution"
            buttonLabel={`Pay ${money(total, currency)} & submit release`}
            disabled={!ready}
            disabledReason={ready ? undefined : "Complete the release details and upload both files to continue."}
            account={{ name: account.name }}
            payload={{
              planId: plan?.id ?? 0,
              artistName,
              releaseTitle,
              genre,
              releaseDate,
              stores,
              explicit,
              isrc,
              upc,
              artworkPath: artwork.path,
              audioPath: master.path,
              notes,
            }}
          />
        </div>
      </div>
    </div>
  );
}
