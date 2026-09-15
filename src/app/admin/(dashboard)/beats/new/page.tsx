import { BeatForm } from "@/components/admin/beat-form";
import { PageHeader } from "@/components/admin/flash";
import { listLicenseTypes } from "@/lib/catalog";
import { num } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { ensureSeeded } from "@/lib/seed";

export default async function NewBeatPage() {
  await ensureSeeded();
  const [settings, types] = await Promise.all([getSettings(), listLicenseTypes()]);
  return (
    <>
      <PageHeader eyebrow="Catalog" title="Upload a new beat" />
      <BeatForm
        beat={null}
        currency={settings.currency}
        licenseTypes={types.map((t) => ({ id: t.id, name: t.name, defaultPrice: num(t.defaultPrice), deliverables: t.deliverables, isExclusive: t.isExclusive }))}
      />
    </>
  );
}
