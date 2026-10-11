"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type LatestNotification = {
  id: number;
  title: string;
  body: string;
  link: string;
};

type NotificationResponse = {
  unread?: number;
  latest?: LatestNotification[];
};

/**
 * Keeps the producer dashboard aware of a new booking while it is open. The
 * server-rendered nav is still the source of truth; this only adds a small
 * polling toast so the producer does not have to refresh manually.
 */
export function NotificationWatcher({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const lastUnread = useRef(initialUnread);
  const [notice, setNotice] = useState<LatestNotification | null>(null);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const response = await fetch("/api/admin/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as NotificationResponse;
        const unread = Number(data.unread ?? 0);
        if (active && unread > lastUnread.current) {
          const newest = data.latest?.[0];
          if (newest) {
            setNotice(newest);
            router.refresh();
            window.setTimeout(() => setNotice(null), 12_000);
          }
        }
        lastUnread.current = unread;
      } catch {
        // A temporary polling failure should never interrupt the admin page.
      }
    }

    const timer = window.setInterval(check, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [router]);

  if (!notice) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:w-[min(26rem,calc(100vw-2rem))]" role="status">
      <div className="glass-acid rounded-2xl border border-acid/50 p-4 text-ink shadow-2xl shadow-black/40">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-lg text-acid" aria-hidden>
            ◷
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">New booking alert</p>
            <p className="mt-1 font-bold">{notice.title}</p>
            <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-ink/75">{notice.body}</p>
            <Link href={notice.link || "/admin/notifications"} className="mt-3 inline-block text-xs font-black underline underline-offset-2">
              Open notification →
            </Link>
          </div>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)} className="text-lg leading-none text-ink/60 hover:text-ink">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
