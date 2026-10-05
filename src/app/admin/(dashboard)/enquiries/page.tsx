import Link from "next/link";
import { Flash, PageHeader } from "@/components/admin/flash";
import { deleteContactMessage, toggleContactHandled } from "../actions";
import { TOPIC_LABELS, listContactMessages, unhandledContactCount } from "@/lib/contact";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Website enquiries" };

/**
 * Website enquiries from the public contact form. Every submission is stored
 * here, whether or not email delivery is configured, so nothing an artist sends
 * can go missing.
 */
export default async function AdminEnquiriesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  const [messages, unhandled] = await Promise.all([listContactMessages(60), unhandledContactCount()]);

  return (
    <>
      <PageHeader eyebrow="Support" title="Website enquiries">
        <p className="text-sm text-muted">
          {unhandled > 0 ? (
            <span className="badge-acid">{unhandled} open</span>
          ) : (
            <span className="badge">All answered</span>
          )}
        </p>
      </PageHeader>
      <Flash msg={msg} err={err} />

      <p className="mb-6 max-w-2xl text-sm text-muted">
        Sent from the public <Link href="/contact" className="text-acid hover:underline">contact page</Link>. Click an email address to reply
        straight from your mail app, then mark the enquiry as answered to keep this list tidy.
      </p>

      {messages.length === 0 ? (
        <div className="card grid h-64 place-items-center p-10 text-center text-sm text-muted">
          No website enquiries yet. When an artist uses the contact form, their message appears here.
        </div>
      ) : (
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className={`card p-5 ${m.handledAt ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{m.name}</p>
                    <span className={m.topic === "refund" ? "badge !border-danger/40 !text-danger" : "badge"}>
                      {TOPIC_LABELS[m.topic] ?? m.topic}
                    </span>
                    {m.handledAt ? <span className="badge-acid">Answered</span> : <span className="badge">Open</span>}
                    {m.orderReference && <span className="badge font-mono">{m.orderReference}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    <a href={`mailto:${m.email}`} className="break-all text-acid hover:underline">
                      {m.email}
                    </a>
                    {m.phone ? (
                      <>
                        {" · "}
                        <a href={`tel:${m.phone.replace(/\s+/g, "")}`} className="hover:text-acid">
                          {m.phone}
                        </a>
                      </>
                    ) : null}
                    {" · "}
                    {formatDateTime(m.createdAt)}
                    {m.source && m.source !== "contact" ? ` · via ${m.source}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to Meetbeatz`)}`} className="btn-ghost !px-3.5 !py-2 text-xs">
                    Reply
                  </a>
                  <form action={toggleContactHandled.bind(null, m.id, !m.handledAt)}>
                    <button type="submit" className="btn-ghost !px-3.5 !py-2 text-xs">
                      {m.handledAt ? "Reopen" : "Mark answered"}
                    </button>
                  </form>
                  <form action={deleteContactMessage.bind(null, m.id)}>
                    <button type="submit" className="btn-danger !px-3.5 !py-2 text-xs">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-line border-t border-line/60 pt-4 text-sm leading-relaxed text-cream/85">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
