import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { DownloadIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { db } from "@/db";
import { soundKits } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { formatBytes } from "@/lib/upload-rules";

export const metadata: Metadata = { title: "Sound Kits" };
export const dynamic = "force-dynamic";

export default async function SoundKitsPage() {
  const kits = await db.select().from(soundKits).where(eq(soundKits.isPublished, true)).orderBy(desc(soundKits.createdAt));

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Library</p>
      <h1 className="display mt-2 text-5xl md:text-6xl">Sound Kits</h1>
      <p className="mt-3 max-w-lg text-sm text-muted">
        Drum kits, loops and sample packs from Meetbeatz. Download a kit and drop it straight into your session.
      </p>

      {kits.length === 0 ? (
        <div className="card mt-10 p-10 text-center">
          <p className="text-3xl">♬</p>
          <p className="mt-3 font-semibold">No sound kits yet</p>
          <p className="mt-1 text-sm text-muted">New packs show up here as soon as they are published.</p>
          <Link href="/beats" className="btn-ghost mt-6">
            Browse beats
          </Link>
        </div>
      ) : (
        <Reveal className="mt-10 space-y-4">
          {kits.map((kit) => (
            <article key={kit.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{kit.name}</h2>
                {kit.description ? <p className="mt-1 text-sm leading-relaxed text-muted">{kit.description}</p> : null}
                <p className="mt-2 text-xs text-muted">
                  {kit.fileName} · {formatBytes(kit.fileSize)} · {formatDate(kit.createdAt)}
                </p>
              </div>
              <a href={`/api/sound-kits/${kit.id}`} className="btn-primary shrink-0" download>
                <DownloadIcon className="h-4 w-4" />
                Download
              </a>
            </article>
          ))}
        </Reveal>
      )}
    </div>
  );
}
