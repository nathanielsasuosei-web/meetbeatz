import Link from "next/link";
import { PageHeader } from "@/components/admin/flash";
import { MessagesPanel } from "@/components/admin/messages-panel";
import { formatDateTime } from "@/lib/format";
import { listThreadMessages, listThreads, threadCustomer } from "@/lib/messages";

export const dynamic = "force-dynamic";

/**
 * Support inbox: every artist's chat thread, with unread badges, and the
 * selected conversation on the right. The artist sees the same thread in the
 * chat widget on the site.
 */
export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId: rawId } = await searchParams;
  const selectedId = parseInt(rawId ?? "", 10);
  const threads = await listThreads();
  const selected = Number.isFinite(selectedId) ? await threadCustomer(selectedId) : null;
  const messages = selected ? await listThreadMessages(selected.id) : [];
  const totalUnread = threads.reduce((sum, t) => sum + t.unread, 0);

  return (
    <>
      <PageHeader eyebrow="Support" title="Messages">
        <p className="text-sm text-muted">
          {totalUnread > 0 ? (
            <span className="text-acid">
              {totalUnread} unread {totalUnread === 1 ? "message" : "messages"}
            </span>
          ) : (
            "Chat with artists who buy from you"
          )}
        </p>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="card max-h-[32rem] overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              No conversations yet. Artists can message you from the chat bubble on the site — their threads show up
              here.
            </p>
          ) : (
            <div className="space-y-1">
              {threads.map((t) => {
                const active = selected?.id === t.customerId;
                return (
                  <Link
                    key={t.customerId}
                    href={`/admin/messages?customerId=${t.customerId}`}
                    className={`block rounded-xl px-3 py-2.5 transition ${active ? "bg-acid/10 ring-1 ring-acid/40" : "hover:bg-white/5"}`}
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
                );
              })}
            </div>
          )}
        </div>

        {selected ? (
          <MessagesPanel customerId={selected.id} customer={{ name: selected.name, email: selected.email }} initialMessages={messages} />
        ) : (
          <div className="card grid h-[32rem] place-items-center p-10 text-center text-sm text-muted">
            {threads.length === 0
              ? "When an artist starts a chat, pick it on the left to answer."
              : "Pick a conversation on the left to read and answer it."}
          </div>
        )}
      </div>
    </>
  );
}
