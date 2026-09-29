"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { ChatThread } from "@/lib/messages";

/** Keep the inbox current even when no conversation has been opened yet. */
export function MessageThreads({ initialThreads, selectedId }: { initialThreads: ChatThread[]; selectedId: number | null }) {
  const [threads, setThreads] = useState(initialThreads);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const res = await fetch("/api/admin/messages", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { threads?: ChatThread[] };
        if (mounted && Array.isArray(data.threads)) setThreads(data.threads);
      } catch {
        // Keep the last available inbox when the connection drops.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 7000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [selectedId]);

  return (
    <div className="card max-h-[32rem] overflow-y-auto p-2">
      {threads.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">
          No conversations yet. Artists can message you from the chat bubble on the site — their threads show up here.
        </p>
      ) : (
        <div className="space-y-1">
          {threads.map((t) => (
            <Link
              key={t.customerId}
              href={`/admin/messages?customerId=${t.customerId}`}
              className={`block rounded-xl px-3 py-2.5 transition ${selectedId === t.customerId ? "bg-acid/10 ring-1 ring-acid/40" : "hover:bg-white/5"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold">{t.name}</p>
                {t.unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-acid px-1 text-[10px] font-bold text-ink">
                    {t.unread > 9 ? "9+" : t.unread}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted">{t.lastBody || "…"}</p>
              <p className="mt-1 text-[10px] text-muted">{formatDateTime(t.lastAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
