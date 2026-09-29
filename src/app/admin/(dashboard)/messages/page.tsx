import { PageHeader } from "@/components/admin/flash";
import { MessagesPanel } from "@/components/admin/messages-panel";
import { MessageThreads } from "@/components/admin/message-threads";
import { listThreadMessages, listThreads, markCustomerMessagesRead, threadCustomer } from "@/lib/messages";

export const dynamic = "force-dynamic";

/** Support inbox: artists' threads and the selected conversation. */
export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId: rawId } = await searchParams;
  const selectedId = Number(rawId);
  const selected = Number.isSafeInteger(selectedId) && selectedId > 0 ? await threadCustomer(selectedId) : null;
  if (selected) await markCustomerMessagesRead(selected.id);
  const [threads, messages] = await Promise.all([
    listThreads(),
    selected ? listThreadMessages(selected.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader eyebrow="Support" title="Messages">
        <p className="text-sm text-muted">Chat with artists who buy from you</p>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <MessageThreads initialThreads={threads} selectedId={selected?.id ?? null} />
        {selected ? (
          <MessagesPanel key={selected.id} customerId={selected.id} customer={{ name: selected.name, email: selected.email }} initialMessages={messages} />
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
