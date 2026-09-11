import { Flash, PageHeader } from "@/components/admin/flash";
import { listLicenseTypes } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import type { LicenseType } from "@/db/schema";
import { saveLicenseType } from "../actions";
import { ensureSeeded } from "@/lib/seed";

function LicenseForm({ lt, currency }: { lt: LicenseType | null; currency: string }) {
  const has = (d: string) => (lt ? lt.deliverables.split(",").includes(d) : d === "mp3");
  return (
    <form action={saveLicenseType} className="card p-5">
      <input type="hidden" name="id" value={lt?.id ?? 0} />
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="label">Name</label>
          <input name="name" className="field" defaultValue={lt?.name ?? ""} required placeholder="Premium Lease" />
        </div>
        <div>
          <label className="label">Default price ({currency})</label>
          <input name="defaultPrice" type="number" min={0} step="0.01" className="field" defaultValue={lt?.defaultPrice ?? ""} required />
        </div>
        <div>
          <label className="label">Order</label>
          <input name="sortOrder" type="number" className="field" defaultValue={lt?.sortOrder ?? 0} />
        </div>
        <div className="md:col-span-4">
          <label className="label">Tagline</label>
          <input name="tagline" className="field" defaultValue={lt?.tagline ?? ""} placeholder="MP3 + WAV · release-ready" />
        </div>
        <div className="md:col-span-4">
          <label className="label">Description</label>
          <input name="description" className="field" defaultValue={lt?.description ?? ""} />
        </div>
        <div className="md:col-span-4">
          <label className="label">License terms (printed on the certificate & email)</label>
          <textarea name="terms" className="field min-h-28 text-xs" defaultValue={lt?.terms ?? ""} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Files:</span>
        {["mp3", "wav", "stems"].map((d) => (
          <label key={d} className="flex items-center gap-1.5">
            <input type="checkbox" name={`d_${d}`} defaultChecked={has(d)} className="h-4 w-4 accent-acid" /> {d.toUpperCase()}
          </label>
        ))}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="isExclusive" defaultChecked={lt?.isExclusive ?? false} className="h-4 w-4 accent-acid" /> Exclusive (removes beat from store when sold)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="isActive" defaultChecked={lt?.isActive ?? true} className="h-4 w-4 accent-acid" /> Active
        </label>
        <button type="submit" className="btn-primary ml-auto !px-4 !py-2 text-xs">
          {lt ? "Save" : "Add license"}
        </button>
      </div>
    </form>
  );
}

export default async function AdminLicensesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await ensureSeeded();
  const { msg, err } = await searchParams;
  const [settings, types] = await Promise.all([getSettings(), listLicenseTypes(false)]);
  return (
    <>
      <PageHeader eyebrow="Licensing" title="License types" />
      <Flash msg={msg} err={err} />
      <p className="mb-6 max-w-2xl text-sm text-muted">
        These are the license options customers choose from. Each beat can override the price per license. Terms are copied into every license
        certificate at the time of purchase.
      </p>
      <div className="space-y-4">
        {types.map((lt) => (
          <LicenseForm key={lt.id} lt={lt} currency={settings.currency} />
        ))}
        <h3 className="pt-4 text-sm font-bold text-muted">Add a new license type</h3>
        <LicenseForm lt={null} currency={settings.currency} />
      </div>
    </>
  );
}
