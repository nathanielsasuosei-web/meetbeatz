import Image from "next/image";
import Link from "next/link";
import { Flash, PageHeader } from "@/components/admin/flash";
import { formatDate, formatDateTime, money } from "@/lib/format";
import { listPlans, listReleases } from "@/lib/distribution";
import { RELEASE_STATUSES, RELEASE_STATUS_LABELS, RELEASE_STATUS_TONES, releaseStatusOf, storeList } from "@/lib/release";
import { getSettings } from "@/lib/settings";
import { storedFileExists } from "@/lib/files";
import { saveDistributionPlan, updateReleaseStatus } from "../actions";

export const metadata = { title: "Distribution" };
export const dynamic = "force-dynamic";

/**
 * Release submissions: what each artist sent, whether it has been paid for, and
 * where it is in review. The audio and artwork are streamed through
 * `/api/artist-files`, which is admin-only for masters — a submission is an
 * unreleased song.
 */
export default async function AdminDistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>
}) {
  const { msg, err } = await searchParams;
  const [settings, plans, releases] = await Promise.all([getSettings(), listPlans(), listReleases(200)]);

  // An artwork path that never finished uploading renders as a broken image for
  // weeks if nobody notices, so the missing ones are labelled instead.
  const artworkPresent = await Promise.all(releases.map((release) => storedFileExists(release.artworkPath)));
  const audioPresent = await Promise.all(releases.map((release) => storedFileExists(release.audioPath)));

  const open = releases.filter((release) => !["live", "rejected", "cancelled"].includes(release.status));

  return (
    <>
      <PageHeader eyebrow="Music distribution" title="Releases">
        <p className="max-w-xs text-right text-xs text-muted">
          {open.length} waiting on you · {releases.length} total
        </p>
      </PageHeader>
      <Flash msg={msg} err={err} />

      {/* ── Tiers ─────────────────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="font-bold">Tiers</h2>
        <p className="mt-1 text-xs text-muted">
          Prices apply to new submissions only. A release keeps the tier name and price it was sold at, so editing these
          never rewrites what somebody already paid.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <form key={plan.id} action={saveDistributionPlan} className="rounded-2xl border border-line bg-white/[0.02] p-4">
              <input type="hidden" name="id" value={plan.id} />
              <input type="hidden" name="sortOrder" value={plan.sortOrder} />
              <div className="grid gap-3">
                <div>
                  <label className="label" htmlFor={`plan-name-${plan.id}`}>Name</label>
                  <input id={`plan-name-${plan.id}`} name="name" className="field" defaultValue={plan.name} required />
                </div>
                <div>
                  <label className="label" htmlFor={`plan-tagline-${plan.id}`}>Tagline</label>
                  <input id={`plan-tagline-${plan.id}`} name="tagline" className="field" defaultValue={plan.tagline} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor={`plan-price-${plan.id}`}>Price ({settings.currency})</label>
                    <input id={`plan-price-${plan.id}`} name="price" type="number" min={0} step="0.01" className="field" defaultValue={plan.price} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`plan-tracks-${plan.id}`}>Tracks</label>
                    <input id={`plan-tracks-${plan.id}`} name="tracks" type="number" min={1} max={100} className="field" defaultValue={plan.tracks} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`plan-days-${plan.id}`}>Turnaround (days)</label>
                    <input id={`plan-days-${plan.id}`} name="turnaroundDays" type="number" min={1} max={120} className="field" defaultValue={plan.turnaroundDays} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`plan-royalty-${plan.id}`}>Your royalty %</label>
                    <input id={`plan-royalty-${plan.id}`} name="royaltyPercent" type="number" min={0} max={100} className="field" defaultValue={plan.royaltyPercent} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted" htmlFor={`plan-active-${plan.id}`}>
                  <input id={`plan-active-${plan.id}`} name="isActive" type="checkbox" className="h-4 w-4" defaultChecked={plan.isActive} />
                  Offered on the distribution page
                </label>
                <button type="submit" className="btn-ghost justify-center">
                  Save tier
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>

      {/* ── Submissions ───────────────────────────────────────────────── */}
      <h2 className="mt-8 font-bold">Submissions</h2>
      {releases.length === 0 ? (
        <div className="card mt-3 p-10 text-center">
          <p className="text-3xl">📀</p>
          <p className="mt-3 font-bold">No releases yet</p>
          <p className="mt-1 text-sm text-muted">
            When an artist pays for distribution, the master, the artwork and everything they told you land here.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {releases.map((release, i) => {
            const status = releaseStatusOf(release.status);
            return (
              <article key={release.id} className="card p-5">
                <div className="grid gap-5 lg:grid-cols-[auto_1fr_minmax(16rem,20rem)]">
                  <div className="mx-auto w-32 shrink-0 lg:mx-0">
                    {release.artworkPath && artworkPresent[i] ? (
                      <Image
                        src={`/api/artist-files/${release.artworkPath}`}
                        alt={`Artwork for ${release.releaseTitle}`}
                        width={128}
                        height={128}
                        unoptimized
                        className="aspect-square w-32 rounded-xl border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="grid aspect-square w-32 place-items-center rounded-xl border border-dashed border-white/15 text-center text-[10px] text-muted">
                        artwork
                        <br />
                        missing
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">{release.releaseTitle}</h3>
                      <span className={RELEASE_STATUS_TONES[status]}>{RELEASE_STATUS_LABELS[status]}</span>
                      <span className="badge">{release.planName}</span>
                      {release.explicit && <span className="badge !border-danger/40 !text-danger">explicit</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {release.artistName}
                      {release.genre ? ` · ${release.genre}` : ""} · <span className="font-mono">{release.reference}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {release.artistEmail}
                      {release.artistPhone ? ` · ${release.artistPhone}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Delivering to <span className="text-cream/85">{storeList(release.stores).join(", ") || "nothing selected"}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {release.releaseDate ? `Requested release date ${formatDate(release.releaseDate)}` : "No release date requested"}
                      {" · "}
                      ISRC {release.isrc || "to assign"} · UPC {release.upc || "to assign"}
                    </p>
                    {release.notes && <p className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-cream/80">“{release.notes}”</p>}
                    <p className="mt-2 text-[11px] text-muted">Submitted {formatDateTime(release.createdAt)}</p>

                    <div className="mt-3">
                      {audioPresent[i] && release.audioPath ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption -- an unreleased master, no caption track exists
                        <audio controls preload="none" className="h-10 w-full max-w-md" src={`/api/artist-files/${release.audioPath}`}>
                          This browser cannot play the master.
                        </audio>
                      ) : (
                        <p className="text-xs text-danger">The master file is missing from storage.</p>
                      )}
                      {release.artworkPath && artworkPresent[i] && (
                        <a
                          href={`/api/artist-files/${release.artworkPath}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs font-semibold text-acid hover:underline"
                        >
                          Open full-size artwork →
                        </a>
                      )}
                    </div>
                  </div>

                  <form action={updateReleaseStatus} className="space-y-2 rounded-2xl border border-line bg-white/[0.02] p-4">
                    <input type="hidden" name="id" value={release.id} />
                    <label className="label" htmlFor={`status-${release.id}`}>Status</label>
                    <select id={`status-${release.id}`} name="status" className="field" defaultValue={release.status}>
                      {RELEASE_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {RELEASE_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                    <label className="label" htmlFor={`note-${release.id}`}>Note to the artist</label>
                    <textarea
                      id={`note-${release.id}`}
                      name="producerNote"
                      className="field min-h-20 text-xs"
                      defaultValue={release.producerNote}
                      placeholder="Required when requesting changes or declining — this is all the artist sees."
                    />
                    <button type="submit" className="btn-primary w-full justify-center">
                      Update release
                    </button>
                    {release.orderId && (
                      <p className="text-center text-[11px] text-muted">
                        Paid order ·{" "}
                        <Link href="/admin/orders" className="text-acid hover:underline">
                          view
                        </Link>
                      </p>
                    )}
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
