"use client";

import { useEffect, useState } from "react";

const CHUNK_STORAGE_KEY = "mb-upload-chunk-size";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * Shows what the browser currently knows about this deployment's upload path,
 * and lets the admin forget it.
 *
 * The beat form halves its part size whenever a proxy refuses a request for
 * being too large (the usual cause of "Upload failed (413)"), and remembers the
 * smaller value so the next upload does not rediscover the limit. That memory is
 * only a guess: if the 413 came from something else — a gateway that has since
 * been reconfigured, or a timeout reported as a 413 — every upload afterwards
 * would still be sliced more finely than it needs to be. Clearing it restores
 * the default.
 *
 * Rendered client-side on purpose: `sessionStorage` cannot be read while
 * server-rendering, and printing "4 MB" before hydration would be wrong.
 */
export function UploadMemory() {
  const [partSize, setPartSize] = useState<number | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    try {
      const stored = Number(window.sessionStorage.getItem(CHUNK_STORAGE_KEY));
      setPartSize(Number.isFinite(stored) && stored > 0 ? stored : null);
    } catch {
      setPartSize(null);
    }
  }, []);

  function clear() {
    try {
      window.sessionStorage.removeItem(CHUNK_STORAGE_KEY);
    } catch {
      // nothing to do — the storage is already unavailable
    }
    setCleared(true);
    setPartSize(null);
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold">Upload path</h2>
      <p className="mt-1 text-xs text-muted">
        Beat files are uploaded in pieces, because a proxy in front of the app can refuse a request body that is too large
        (that refusal is the <span className="font-mono">413</span> error). The form starts at 4 MB per piece and halves it
        automatically when the proxy says no — the smallest it will try is 128 KB.
      </p>
      <p className="mt-3 text-xs text-muted">
        {partSize === null ? (
          <>This browser is using the default 4 MB pieces.</>
        ) : (
          <>
            This browser last uploaded in <strong className="text-cream">{formatBytes(partSize)}</strong> pieces, because a
            larger size was refused.
          </>
        )}
      </p>
      {cleared && <p className="mt-2 text-xs text-ok">Cleared — the next upload will try 4 MB pieces again.</p>}
      <button type="button" onClick={clear} className="btn-ghost mt-4 !px-4 text-xs" disabled={partSize === null && !cleared}>
        Clear remembered piece size
      </button>
    </div>
  );
}
