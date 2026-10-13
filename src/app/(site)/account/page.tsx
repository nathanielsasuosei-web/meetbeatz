import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "./actions";
import { EmailChangeForm } from "@/components/account/email-form";
import { DownloadIcon } from "@/components/icons";
import { loadAccountData } from "@/lib/account";
import { getCustomerSession } from "@/lib/customer-auth";
import { listReleasesForCustomer } from "@/lib/distribution";
import { listRemoteSessionsForCustomer } from "@/lib/remote-sessions";
import {
  RELEASE_STATUS_HINTS,
  RELEASE_STATUS_LABELS,
  RELEASE_STATUS_TONES,
  SESSION_GOAL_LABELS,
  SESSION_STATUS_LABELS,
  SESSION_STATUS_TONES,
  releaseStatusOf,
  sessionStatusOf,
  storeList,
} from "@/lib/release";
import { formatTime12 } from "@/lib/format";
import { DELIVERABLE_LABELS, deliverableList, formatDate, formatDateTime, money, statusLabel } from "@/lib/format";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your account" };

const ORDER_STATUS_TONE: Record<string, string> = {
  paid: "badge-acid",
  pending: "badge",
};

export default async function AccountPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/account/login");
  const { orders, bookings } = await loadAccountData(session);
  const [releases, remoteSessions] = await Promise.all([
    listReleasesForCustomer(session),
    listRemoteSessionsForCustomer(session),
  ]);
  const beatOrders = orders.filter((o) => o.order.kind === "beat");
  const bookingOrders = orders.filter((o) => o.order.kind === "booking");
  /** Distribution receipts live on the order, so the release card links to one. */
  const orderReference = new Map(orders.map(({ order }) => [order.id, order.reference]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">Hey, {session.name.split(" ")[0]} 👋</h1>
          <p className="mt-3 text-sm text-muted">
            Signed in as <span className="text-cream">{session.email}</span>
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="btn-ghost">
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-8">
        <div className="card p-6">
          <p className="eyebrow">Account</p>
          <h2 className="mt-2 text-2xl font-bold">Email address</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            You are signed in as <span className="text-cream">{session.email}</span>. Enter a new address below and your
            account moves to it — receipts, download links, license certificates and chat replies all follow. Anything
            you have already bought stays here, and purchases made with the new address join this account automatically.
          </p>
          <div className="mt-5 max-w-md">
            <EmailChangeForm currentEmail={session.email} />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="eyebrow">Library</p>
            <h2 className="mt-2 text-2xl font-bold">Sound Kits</h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              The same public kits on the store — open the library and download any pack, no extra login step.
            </p>
          </div>
          <Link href="/sound-kits" className="btn-primary">
            Sound Kits
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Collection</p>
            <h2 className="mt-2 text-2xl font-bold">Your beats</h2>
          </div>
          <Link href="/beats" className="text-sm font-bold text-acid hover:underline">
            Browse more beats →
          </Link>
        </div>

        {beatOrders.length === 0 ? (
          <div className="card mt-5 p-10 text-center text-sm text-muted">
            No beats here yet. Anything you buy with this email shows up on this page — with its files and license
            certificate ready to download.
          </div>
        ) : (
          <Reveal className="mt-5 space-y-4">
            {beatOrders.map(({ order, items, licenses }) => (
              <div key={order.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge ${ORDER_STATUS_TONE[order.status] ?? "badge"}`}>{statusLabel(order.status)}</span>
                      <span className="font-mono text-xs text-muted">{order.reference}</span>
                      <span className="text-xs text-muted">{formatDate(order.paidAt ?? order.createdAt)}</span>
                    </div>
                    <div className="mt-3 space-y-1">
                      {items.map((item) => (
                        <p key={item.id} className="text-sm">
                          <span className="font-bold text-cream">{item.beatTitle}</span>
                          <span className="text-muted"> — {item.licenseName} license</span>
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-acid">{money(order.total, order.currency)}</p>
                    <Link href={`/orders/${order.reference}`} className="mt-1 inline-block text-xs font-semibold text-muted hover:text-cream">
                      View order →
                    </Link>
                  </div>
                </div>

                {order.status === "paid" && licenses.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    {licenses.map((license) =>
                      deliverableList(license.deliverables).map((file) => (
                        <a
                          key={`${license.id}-${file}`}
                          href={`/api/download/${license.downloadToken}?file=${file}`}
                          className="btn-ghost !px-3.5 !py-2 text-xs"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          {DELIVERABLE_LABELS[file] ?? file.toUpperCase()}
                        </a>
                      )),
                    )}
                    {licenses.map((license) => (
                      <Link key={`cert-${license.id}`} href={`/license/${license.licenseKey}`} className="btn-ghost !px-3.5 !py-2 text-xs">
                        License certificate
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Reveal>
        )}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Studio</p>
            <h2 className="mt-2 text-2xl font-bold">Your sessions</h2>
          </div>
          <Link href="/studio" className="text-sm font-bold text-acid hover:underline">
            Book a session →
          </Link>
        </div>
        {bookings.length === 0 ? (
          <div className="card mt-5 p-10 text-center text-sm text-muted">
            No studio sessions yet — book recording, mixing or mastering time and it will appear here.
          </div>
        ) : (
          <Reveal className="mt-5 space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-bold">{b.serviceName}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(b.bookingDate)} · {b.startTime}–{b.endTime} ({b.hours}h)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge">{statusLabel(b.status)}</span>
                  {b.orderId && bookingOrders.find((o) => o.order.id === b.orderId) && (
                    <Link
                      href={`/orders/${bookingOrders.find((o) => o.order.id === b.orderId)!.order.reference}`}
                      className="text-xs font-semibold text-muted hover:text-cream"
                    >
                      View order →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </Reveal>
        )}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Distribution</p>
            <h2 className="mt-2 text-2xl font-bold">Your releases</h2>
          </div>
          <Link href="/distribution" className="text-sm font-bold text-acid hover:underline">
            Submit a release →
          </Link>
        </div>
        {releases.length === 0 ? (
          <div className="card mt-5 p-10 text-center text-sm text-muted">
            No releases yet. Submit a finished song with its artwork and it goes out to Spotify, Apple Music, Boomplay and
            the rest — one flat fee, and you keep your royalties.
          </div>
        ) : (
          <Reveal className="mt-5 space-y-4">
            {releases.map((release) => {
              const status = releaseStatusOf(release.status);
              const reference = release.orderId ? orderReference.get(release.orderId) : undefined;
              return (
                <div key={release.id} className="card p-5">
                  <div className="flex flex-wrap gap-4">
                    {release.artworkPath && (
                      <Image
                        src={`/api/artist-files/${release.artworkPath}`}
                        alt={`Artwork for ${release.releaseTitle}`}
                        width={96}
                        height={96}
                        unoptimized
                        data-sg-protect=""
                        className="h-24 w-24 shrink-0 rounded-xl border border-white/10 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{release.releaseTitle}</h3>
                        <span className={RELEASE_STATUS_TONES[status]}>{RELEASE_STATUS_LABELS[status]}</span>
                        <span className="badge">{release.planName}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {release.artistName}
                        {release.genre ? ` · ${release.genre}` : ""} · <span className="font-mono">{release.reference}</span> ·{" "}
                        {formatDate(release.createdAt)}
                      </p>
                      <p className="mt-1.5 text-xs text-muted">{storeList(release.stores).join(" · ")}</p>
                      <p className="mt-2 text-sm text-cream/85">{RELEASE_STATUS_HINTS[status]}</p>
                      {release.producerNote && (
                        <p className="mt-2 rounded-xl border border-acid/25 bg-acid/[0.06] px-3 py-2 text-sm text-cream/90">
                          <span className="font-bold text-acid">From the studio:</span> {release.producerNote}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {release.audioPath && (
                          // eslint-disable-next-line jsx-a11y/media-has-caption -- the artist's own unreleased master
                          <audio controls preload="none" className="h-9 w-full max-w-xs" src={`/api/artist-files/${release.audioPath}`}>
                            Your browser cannot play this file.
                          </audio>
                        )}
                        {reference && (
                          <Link href={`/orders/${reference}`} className="text-xs font-semibold text-muted hover:text-cream">
                            View receipt →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Reveal>
        )}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Online recording</p>
            <h2 className="mt-2 text-2xl font-bold">Your remote sessions</h2>
          </div>
          <Link href="/record" className="text-sm font-bold text-acid hover:underline">
            Record a take →
          </Link>
        </div>
        {remoteSessions.length === 0 ? (
          <div className="card mt-5 p-10 text-center text-sm text-muted">
            No remote sessions yet. Record a vocal in your browser, send the best take, and the producer will schedule the
            live session.
          </div>
        ) : (
          <Reveal className="mt-5 space-y-3">
            {remoteSessions.map((item) => {
              const status = sessionStatusOf(item.status);
              return (
                <div key={item.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{SESSION_GOAL_LABELS[item.goal] ?? item.goal}</h3>
                        <span className={SESSION_STATUS_TONES[status]}>{SESSION_STATUS_LABELS[status]}</span>
                        <span className="font-mono text-xs text-muted">{item.reference}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {item.preferredDate
                          ? `${formatDate(item.preferredDate)}${item.preferredTime ? ` · ${formatTime12(item.preferredTime)}` : ""}`
                          : "No time suggested"}
                        {item.beatTitle ? ` · over “${item.beatTitle}”` : ""} · requested {formatDate(item.createdAt)}
                      </p>
                      {item.producerNote && (
                        <p className="mt-2 rounded-xl border border-acid/25 bg-acid/[0.06] px-3 py-2 text-sm text-cream/90">
                          <span className="font-bold text-acid">From the studio:</span> {item.producerNote}
                        </p>
                      )}
                      {item.takePath && (
                        <div className="mt-3">
                          <p className="text-xs text-muted">
                            {item.takeName || "Your take"}
                            {item.takeSeconds ? ` · ${Math.round(item.takeSeconds)}s` : ""}
                          </p>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the artist's own vocal take */}
                          <audio controls preload="none" className="mt-1 h-9 w-full max-w-xs" src={`/api/artist-files/${item.takePath}`}>
                            Your browser cannot play this file.
                          </audio>
                        </div>
                      )}
                    </div>
                    <Link href="/studio?service=online-session" className="btn-ghost shrink-0 !px-3.5 !py-2 text-xs">
                      Book the studio time
                    </Link>
                  </div>
                </div>
              );
            })}
          </Reveal>
        )}
      </section>

      <section className="mt-12">
        <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-xl font-bold">Questions? Chat with us 💬</h2>
            <p className="mt-1 text-sm text-muted">
              Use the chat bubble in the corner — it goes straight to Meetbeatz and the replies land right there.
            </p>
          </div>
          <Link href="/beats" className="btn-primary">
            Keep browsing
          </Link>
        </div>
      </section>

      {bookingOrders.length > 0 && (
        <p className="mt-8 text-xs text-muted">
          Booking payments are also listed in Your sessions above ·{" "}
          {bookingOrders.map((o, i) => (
            <span key={o.order.id}>
              {i > 0 && " · "}
              <Link href={`/orders/${o.order.reference}`} className="hover:text-cream">
                {o.order.reference}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
