import Link from "next/link";
import { desc } from "drizzle-orm";
import { SoundKitForm } from "@/components/admin/sound-kit-form";
import { Flash, PageHeader } from "@/components/admin/flash";
import { db } from "@/db";
import { soundKits } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { formatBytes } from "@/lib/upload-rules";
import { deleteSoundKit, toggleSoundKitPublished } from "../actions";

export const dynamic = "force-dynamic";

export default async function SoundKitsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  const kits = await db.select().from(soundKits).orderBy(desc(soundKits.createdAt));

  return (
    <>
      <PageHeader eyebrow="Library" title="Sound Kits">
        <Link href="#upload-sound-kit" className="btn-primary">
          + Upload sound kit
        </Link>
      </PageHeader>
      <Flash msg={msg} err={err} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div id="upload-sound-kit">
          <SoundKitForm />
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-bold">Uploaded kits</h2>
              <p className="mt-1 text-xs text-muted">{kits.length} {kits.length === 1 ? "sound kit" : "sound kits"} in your library.</p>
            </div>
          </div>

          {kits.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-3xl">♬</p>
              <p className="mt-3 font-semibold">No sound kits yet</p>
              <p className="mt-1 text-sm text-muted">Upload your first ZIP, RAR or 7Z kit from the form.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {kits.map((kit) => (
                <li key={kit.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{kit.name}</h3>
                      <span className={kit.isPublished ? "badge-acid" : "badge"}>{kit.isPublished ? "Public" : "Hidden"}</span>
                    </div>
                    {kit.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{kit.description}</p>}
                    <p className="mt-2 text-[11px] text-muted">
                      {kit.fileName} · {formatBytes(kit.fileSize)} · uploaded {formatDateTime(kit.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <form action={toggleSoundKitPublished.bind(null, kit.id)}>
                      <button type="submit" className="btn-ghost !px-3 !py-1.5 text-xs">
                        {kit.isPublished ? "Hide" : "Make public"}
                      </button>
                    </form>
                    <a href={`/api/admin/sound-kits/${kit.id}`} className="btn-ghost !px-3 !py-1.5 text-xs" download>
                      Download
                    </a>
                    <form action={deleteSoundKit.bind(null, kit.id)}>
                      <button type="submit" className="btn-danger !px-3 !py-1.5 text-xs">
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}