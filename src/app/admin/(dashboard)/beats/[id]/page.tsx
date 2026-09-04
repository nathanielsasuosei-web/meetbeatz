import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { beatLicenses, beats } from "@/db/schema";
import { BeatForm, type BeatFormValues } from "@/components/admin/beat-form";
import { PageHeader } from "@/components/admin/flash";
import { listLicenseTypes } from "@/lib/catalog";
import { coverUrl, num } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export default async function EditBeatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beatId = parseInt(id, 10);
  if (!Number.isFinite(beatId)) notFound();
  const [[beat], settings, types, prices] = await Promise.all([
    db.select().from(beats).where(eq(beats.id, beatId)).limit(1),
    getSettings(),
    listLicenseTypes(false),
    db.select().from(beatLicenses).where(eq(beatLicenses.beatId, beatId)),
  ]);
  if (!beat) notFound();

  const values: BeatFormValues = {
    id: beat.id,
    title: beat.title,
    genre: beat.genre,
    mood: beat.mood,
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    tags: beat.tags,
    description: beat.description,
    isPublished: beat.isPublished,
    isFeatured: beat.isFeatured,
    cover: coverUrl(beat.coverPath),
    hasPreview: !!beat.previewPath,
    hasMp3: !!beat.mp3Path,
    hasWav: !!beat.wavPath,
    hasStems: !!beat.stemsPath,
    prices: Object.fromEntries(prices.map((p) => [p.licenseTypeId, { enabled: p.isEnabled, price: num(p.price) }])),
  };

  return (
    <>
      <PageHeader eyebrow="Catalog" title={`Edit: ${beat.title}`} />
      <BeatForm
        beat={values}
        currency={settings.currency}
        licenseTypes={types.map((t) => ({ id: t.id, name: t.name, defaultPrice: num(t.defaultPrice), deliverables: t.deliverables, isExclusive: t.isExclusive }))}
      />
    </>
  );
}
