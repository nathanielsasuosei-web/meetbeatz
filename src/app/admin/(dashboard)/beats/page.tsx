import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { beatLicenses, beats, licenseTypes } from "@/db/schema";
import { CoverArt } from "@/components/beat-card";
import { Flash, PageHeader } from "@/components/admin/flash";
import { coverUrl, money } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { deleteBeat, toggleBeatFeatured, toggleBeatPublished } from "../actions";

export default async function AdminBeatsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  const [settings, rows, prices] = await Promise.all([
    getSettings(),
    db.select().from(beats).orderBy(desc(beats.createdAt)),
    db
      .select({ beatId: beatLicenses.beatId, price: beatLicenses.price, enabled: beatLicenses.isEnabled, name: licenseTypes.name, sort: licenseTypes.sortOrder })
      .from(beatLicenses)
      .innerJoin(licenseTypes, eq(beatLicenses.licenseTypeId, licenseTypes.id))
      .orderBy(asc(licenseTypes.sortOrder)),
  ]);
  const priceMap = new Map<number, { name: string; price: string; enabled: boolean }[]>();
  for (const p of prices) {
    const arr = priceMap.get(p.beatId) ?? [];
    arr.push({ name: p.name, price: p.price, enabled: p.enabled });
    priceMap.set(p.beatId, arr);
  }

  return (
    <>
      <PageHeader eyebrow="Catalog" title={`Beats (${rows.length})`}>
        <Link href="/admin/beats/new" className="btn-primary">
          + Upload beat
        </Link>
      </PageHeader>
      <Flash msg={msg} err={err} />

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No beats yet.{" "}
          <Link href="/admin/beats/new" className="font-semibold text-acid">
            Upload your first beat →
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Beat</th>
                <th>Details</th>
                <th>Licenses</th>
                <th>Files</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const list = priceMap.get(b.id) ?? [];
                return (
                  <tr key={b.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-panel-2">
                          <CoverArt beat={{ cover: coverUrl(b.coverPath), title: b.title }} />
                        </div>
                        <div>
                          <Link href={`/admin/beats/${b.id}`} className="font-semibold hover:text-acid">
                            {b.title}
                          </Link>
                          <p className="text-[11px] text-muted">
                            {b.isDemo ? "Demo · " : ""}
                            {b.plays} plays
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs text-muted">
                      {[b.genre, b.bpm ? `${b.bpm} BPM` : null, b.musicalKey, b.mood].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="text-xs">
                      {list.filter((l) => l.enabled).length === 0 ? (
                        <span className="text-danger">No licenses enabled</span>
                      ) : (
                        list
                          .filter((l) => l.enabled)
                          .map((l) => (
                            <p key={l.name}>
                              {l.name}: <span className="text-acid">{money(l.price, settings.currency)}</span>
                            </p>
                          ))
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {b.previewPath && <span className="badge">Preview</span>}
                        {b.mp3Path && <span className="badge">MP3</span>}
                        {b.wavPath && <span className="badge">WAV</span>}
                        {b.stemsPath && <span className="badge">Stems</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {b.exclusiveSold ? (
                          <span className="badge !border-danger/40 !text-danger">Exclusive sold</span>
                        ) : (
                          <span className={b.isPublished ? "badge-acid" : "badge"}>{b.isPublished ? "Published" : "Hidden"}</span>
                        )}
                        {b.isFeatured && <span className="badge">Featured</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link href={`/admin/beats/${b.id}`} className="btn-ghost !px-3 !py-1.5 text-xs">
                          Edit
                        </Link>
                        <form action={toggleBeatPublished.bind(null, b.id)}>
                          <button className="btn-ghost !px-3 !py-1.5 text-xs">{b.isPublished ? "Hide" : "Publish"}</button>
                        </form>
                        <form action={toggleBeatFeatured.bind(null, b.id)}>
                          <button className="btn-ghost !px-3 !py-1.5 text-xs">{b.isFeatured ? "Unfeature" : "Feature"}</button>
                        </form>
                        <form action={deleteBeat.bind(null, b.id)}>
                          <button className="btn-danger !px-3 !py-1.5 text-xs">Delete</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
