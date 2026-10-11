"use client";

import { useEffect, useState } from "react";
import { BeatGrid } from "@/components/beat-card";
import { BeatList } from "@/components/beat-list";
import { GridIcon, ListIcon } from "@/components/icons";
import type { BeatCardData } from "@/lib/catalog";

export type BeatView = "list" | "grid";

const STORAGE_KEY = "meetbeatz:beat-view";

/**
 * The same catalogue in two shapes — a tracklist and a card grid — with the
 * visitor's choice remembered. The list is the default: it shows title, genre,
 * BPM, key, plays and price on one row, which is how producers actually skim a
 * store looking for a tempo.
 */
export function BeatBrowser({ beats, currency, initialView = "list" }: { beats: BeatCardData[]; currency: string; initialView?: BeatView }) {
  const [view, setView] = useState<BeatView>(initialView);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "list" || saved === "grid") setView(saved);
    } catch {
      /* storage blocked — keep the default */
    }
  }, []);

  const choose = (next: BeatView) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <div className="view-switch" role="group" aria-label="Beat display">
          {(["list", "grid"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => choose(v)}
              aria-pressed={view === v}
              className={`view-switch-btn ${view === v ? "is-on" : ""}`}
            >
              {v === "list" ? <ListIcon className="h-4 w-4" /> : <GridIcon className="h-4 w-4" />}
              <span className="text-xs font-bold capitalize">{v}</span>
            </button>
          ))}
        </div>
      </div>
      {view === "list" ? <BeatList beats={beats} currency={currency} /> : <BeatGrid beats={beats} currency={currency} />}
    </div>
  );
}
