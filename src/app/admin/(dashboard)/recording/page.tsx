import Link from "next/link";
import { Flash, PageHeader } from "@/components/admin/flash";
import { formatDate, formatDateTime, formatTime12 } from "@/lib/format";
import { listRemoteSessions } from "@/lib/remote-sessions";
import { storedFileExists } from "@/lib/files";
import { SESSION_GOAL_LABELS, SESSION_STATUSES, SESSION_STATUS_LABELS, SESSION_STATUS_TONES, sessionStatusOf } from "@/lib/release";
import { updateRemoteSessionStatus } from "../actions";

export const metadata = { title: "Online recording" };
export const dynamic = "force-dynamic";

/**
 * Remote session requests: the take the artist recorded in the browser studio,
 * what they want from the session, and when they would like it.
 *
 * The live call itself is not hosted here — confirming a session moves it to
 * "scheduled" and the artist is told in their chat thread, which is where the
 * call link goes. The paid studio time is booked separately under the
 * `online-session` service, so this page never handles money.
 */
export default async function AdminRecordingPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>
}) {
  const { msg, err } = await searchParams;
  const sessions = await listRemoteSessions(200);
  const takePresent = await Promise.all(sessions.map((session) => storedFileExists(session.takePath)));
  const open = sessions.filter((session) => session.status === "requested" || session.status === "scheduled");

  return (
    <>
      <PageHeader eyebrow="Online recording" title="Remote sessions">
        <p className="max-w-xs text-right text-xs text-muted">
          {open.length} open · {sessions.length} total
        </p>
      </PageHeader>
      <Flash msg={msg} err={err} />

      <div className="card p-5">
        <h2 className="font-bold">How a remote session runs</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted">
          <li>The artist records a dry vocal in the browser studio at <Link href="/record" className="text-acid hover:underline">/record</Link> and sends it here.</li>
          <li>Listen to the take, then set the status to <strong className="text-cream">Scheduled</strong> and write the call link and time in the note — that note is posted into the artist&apos;s chat thread automatically.</li>
          <li>The paid studio time is booked under the <strong className="text-cream">Online session with the producer</strong> service on <Link href="/admin/studio" className="text-acid hover:underline">Studio &amp; hours</Link>, so the slot is locked and the deposit taken the normal way.</li>
          <li>After the session, mark it <strong className="text-cream">Completed</strong>. The take stays attached for reference.</li>
        </ol>
      </div>

      {sessions.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="text-3xl">🎙️</p>
          <p className="mt-3 font-bold">No remote sessions yet</p>
          <p className="mt-1 text-sm text-muted">
            When an artist records in the browser studio and sends you the take, it appears here with the audio attached.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {sessions.map((session, i) => {
            const status = sessionStatusOf(session.status);
            return (
              <article key={session.id} className="card p-5">
                <div className="grid gap-5 lg:grid-cols-[1fr_minmax(16rem,20rem)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">{session.artistName}</h3>
                      <span className={SESSION_STATUS_TONES[status]}>{SESSION_STATUS_LABELS[status]}</span>
                      <span className="badge">{SESSION_GOAL_LABELS[session.goal] ?? session.goal}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {session.artistEmail}
                      {session.artistPhone ? ` · ${session.artistPhone}` : ""} · <span className="font-mono">{session.reference}</span>
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {session.preferredDate ? `Wants ${formatDate(session.preferredDate)}` : "No date suggested"}
                      {session.preferredTime ? ` at ${formatTime12(session.preferredTime)}` : ""}
                      {session.beatTitle ? ` · over “${session.beatTitle}”` : ""}
                    </p>
                    {session.notes && <p className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-cream/80">“{session.notes}”</p>}
                    {session.producerNote && (
                      <p className="mt-2 rounded-lg border border-acid/25 bg-acid/[0.06] px-3 py-2 text-xs text-cream/85">
                        <span className="font-bold text-acid">Your last note:</span> {session.producerNote}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-muted">Requested {formatDateTime(session.createdAt)}</p>

                    <div className="mt-3">
                      {session.takePath && takePresent[i] ? (
                        <>
                          <p className="text-xs font-semibold text-cream/85">
                            {session.takeName || "Take"}
                            {session.takeSeconds ? ` · ${Math.round(session.takeSeconds)}s` : ""}
                          </p>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a raw vocal take, no caption track exists */}
                          <audio controls preload="none" className="mt-1 h-10 w-full max-w-md" src={`/api/artist-files/${session.takePath}`}>
                            This browser cannot play the take.
                          </audio>
                          <a
                            href={`/api/artist-files/${session.takePath}`}
                            download
                            className="mt-2 inline-block text-xs font-semibold text-acid hover:underline"
                          >
                            Download the WAV →
                          </a>
                        </>
                      ) : session.takePath ? (
                        <p className="text-xs text-danger">The take file is missing from storage.</p>
                      ) : (
                        <p className="text-xs text-muted">No take uploaded — they are booking the time only.</p>
                      )}
                    </div>
                  </div>

                  <form action={updateRemoteSessionStatus} className="space-y-2 rounded-2xl border border-line bg-white/[0.02] p-4">
                    <input type="hidden" name="id" value={session.id} />
                    <label className="label" htmlFor={`session-status-${session.id}`}>Status</label>
                    <select id={`session-status-${session.id}`} name="status" className="field" defaultValue={session.status}>
                      {SESSION_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {SESSION_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                    <label className="label" htmlFor={`session-note-${session.id}`}>Note to the artist</label>
                    <textarea
                      id={`session-note-${session.id}`}
                      name="producerNote"
                      className="field min-h-24 text-xs"
                      defaultValue={session.producerNote}
                      placeholder="Put the call link and the confirmed time here — it lands in their chat thread."
                    />
                    <button type="submit" className="btn-primary w-full justify-center">
                      Update session
                    </button>
                    <Link href={`/studio?service=online-session`} className="btn-ghost w-full justify-center">
                      Book the paid time
                    </Link>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
