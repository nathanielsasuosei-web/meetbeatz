"use client";

import { useState } from "react";
import { validateAdsTxt } from "@/lib/ads-txt-format";
import { saveAdsTxtAction } from "@/app/admin/(dashboard)/actions";

type Props = {
  /** Current contents of the live ads.txt file (loaded server-side). */
  initialContents: string;
  /** Whether NEXT_PUBLIC_ADSENSE_PUBLISHER_ID is configured. */
  publisherConfigured: boolean;
  /** Whether NEXT_PUBLIC_ADSENSE_AUTO_ADS is set to "1" in the build env. */
  autoAdsEnabled: boolean;
  /** Whether NEXT_PUBLIC_ADSENSE_SLOT_BEAT_DETAIL is configured. */
  beatDetailSlotConfigured: boolean;
  /** Live URL where ads.txt is served (e.g. https://meetbeatz.com/ads.txt). */
  liveUrl: string;
};

/**
 * Admin editor for ads.txt. Saves through a server action to PostgreSQL;
 * the dynamic /ads.txt route serves the latest contents, including on
 * serverless hosts where public/ is read-only. Performs live client-side
 * validation so admins don't publish an obviously malformed file.
 *
 * Submitting the form follows the same `?msg=&err=` flash pattern as
 * the rest of the admin settings — the server action redirects on
 * success / failure and re-renders the page with the result.
 */
export function AdsTxtEditor({
  initialContents,
  publisherConfigured,
  autoAdsEnabled,
  beatDetailSlotConfigured,
  liveUrl,
}: Props) {
  const [contents, setContents] = useState(initialContents);
  const issues = validateAdsTxt(contents);
  const dirty = contents !== initialContents;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Ads &amp; ads.txt</h2>
          <p className="mt-1 text-xs text-muted">
            Google recommends <code className="font-mono">ads.txt</code> at your domain root so ad buyers can verify authorized sellers.
            Paste the exact snippet from AdSense below — it is served live at{" "}
            <a href={liveUrl} target="_blank" rel="noreferrer" className="font-mono text-acid underline-offset-2 hover:underline">
              {liveUrl.replace(/^https?:\/\//, "")}
            </a>
            .
          </p>
        </div>
        <a href={liveUrl} target="_blank" rel="noreferrer" className="btn-ghost shrink-0 !px-3 text-xs">
          View live ↗
        </a>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <Pill
          ok={publisherConfigured}
          okLabel="Publisher ID configured"
          badLabel="Publisher ID not set"
        />
        <Pill
          ok={beatDetailSlotConfigured}
          okLabel="Manual unit: beat detail"
          badLabel="Manual unit: beat detail (slot unset)"
        />
        <Pill
          ok={autoAdsEnabled}
          okLabel="Auto Ads enabled"
          badLabel="Auto Ads off (set NEXT_PUBLIC_ADSENSE_AUTO_ADS=1)"
        />
      </div>

      <form action={saveAdsTxtAction} className="space-y-3">
        <input type="hidden" name="contents" value={contents} />
        <div>
          <label className="label">ads.txt contents</label>
          <textarea
            value={contents}
            onChange={(e) => setContents(e.target.value)}
            className="field min-h-40 font-mono"
            spellCheck={false}
            placeholder={`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, ffffffffffffffff`}
          />
          <p className="mt-1 text-[11px] text-muted">
            One line per record, comma-separated: <code className="font-mono">ADSYSTEM_DOMAIN, PUBLISHER_ACCOUNT_ID, RELATIONSHIP, CERT_ID</code>.
            Lines starting with <code className="font-mono">#</code> are comments.
          </p>
        </div>

        {issues.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
            <strong>Will not save:</strong>
            <ul className="mt-1 list-disc pl-5">
              {issues.slice(0, 5).map((iss, idx) => (
                <li key={idx}>
                  {iss.line > 0 ? `Line ${iss.line}: ` : ""}
                  {iss.message}
                </li>
              ))}
              {issues.length > 5 && <li>… and {issues.length - 5} more</li>}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={!dirty || issues.length > 0}
          >
            Save ads.txt
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setContents(initialContents)}
            disabled={!dirty}
          >
            Reset
          </button>
          <span className="text-[11px] text-muted">
            Saved in the database and served live at <code className="font-mono">/ads.txt</code>. Configured Meetbeatz seller records are kept in the live file automatically.
          </span>
        </div>

        {!publisherConfigured && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            AdSense will not serve any ads until <code className="font-mono">NEXT_PUBLIC_ADSENSE_PUBLISHER_ID</code> is set to a real{" "}
            <code className="font-mono">ca-pub-...</code> ID in <code className="font-mono">.env</code> and the server is restarted.
          </div>
        )}
      </form>
    </div>
  );
}

function Pill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${ok ? "border-ok/30 text-ok" : "border-amber-500/30 text-amber-300"}`}
    >
      <span className="mr-1.5">{ok ? "✓" : "○"}</span>
      {ok ? okLabel : badLabel}
    </div>
  );
}