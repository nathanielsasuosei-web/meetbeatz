import { asc } from "drizzle-orm";
import { db } from "@/db";
import { services, studioHours } from "@/db/schema";
import { Flash, PageHeader } from "@/components/admin/flash";
import { DAY_NAMES } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { deleteService, saveHours, saveService } from "../actions";

function ServiceForm({ service, currency }: { service: typeof services.$inferSelect | null; currency: string }) {
  return (
    <form action={saveService} className="card p-5">
      <input type="hidden" name="id" value={service?.id ?? 0} />
      <div className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="label">Service name</label>
          <input name="name" className="field" defaultValue={service?.name ?? ""} placeholder="Recording" required />
        </div>
        <div>
          <label className="label">Price / hour ({currency})</label>
          <input name="pricePerHour" type="number" min={0} step="0.01" className="field" defaultValue={service?.pricePerHour ?? ""} required />
        </div>
        <div>
          <label className="label">Min hrs</label>
          <input name="minHours" type="number" min={1} className="field" defaultValue={service?.minHours ?? 1} />
        </div>
        <div>
          <label className="label">Max hrs</label>
          <input name="maxHours" type="number" min={1} className="field" defaultValue={service?.maxHours ?? 8} />
        </div>
        <div>
          <label className="label">Deposit %</label>
          <input name="depositPercent" type="number" min={1} max={100} className="field" defaultValue={service?.depositPercent ?? 50} />
        </div>
        <div className="md:col-span-5">
          <label className="label">Description</label>
          <input name="description" className="field" defaultValue={service?.description ?? ""} placeholder="What's included in this session?" />
        </div>
        <div>
          <label className="label">Order</label>
          <input name="sortOrder" type="number" className="field" defaultValue={service?.sortOrder ?? 0} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={service?.isActive ?? true} className="h-4 w-4 accent-acid" /> Bookable online
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary !px-4 !py-2 text-xs">
            {service ? "Save" : "Add service"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default async function AdminStudioPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  const [settings, rows, hours] = await Promise.all([
    getSettings(),
    db.select().from(services).orderBy(asc(services.sortOrder), asc(services.id)),
    db.select().from(studioHours).orderBy(asc(studioHours.dayOfWeek)),
  ]);
  const hourMap = new Map(hours.map((h) => [h.dayOfWeek, h]));

  return (
    <>
      <PageHeader eyebrow="Studio" title="Services & opening hours" />
      <Flash msg={msg} err={err} />

      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <h2 className="font-bold">Services</h2>
          {rows.map((s) => (
            <div key={s.id} className="relative">
              <ServiceForm service={s} currency={settings.currency} />
              <form action={deleteService.bind(null, s.id)} className="absolute right-5 top-5">
                <button className="text-xs font-semibold text-danger hover:underline">Remove</button>
              </form>
            </div>
          ))}
          <div>
            <h3 className="mb-2 text-sm font-bold text-muted">Add a new service</h3>
            <ServiceForm service={null} currency={settings.currency} />
          </div>
        </section>

        <section>
          <h2 className="font-bold">Opening hours</h2>
          <p className="mt-1 text-xs text-muted">Customers can only book start times inside these hours. Sessions start on the hour.</p>
          <form action={saveHours} className="card mt-4 p-5">
            <div className="space-y-3">
              {DAY_NAMES.map((name, dow) => {
                const h = hourMap.get(dow);
                return (
                  <div key={dow} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-sm">
                    <span className="font-semibold">{name}</span>
                    <input type="time" name={`opens_${dow}`} className="field !w-28 !px-2" defaultValue={h?.opensAt ?? "09:00"} />
                    <input type="time" name={`closes_${dow}`} className="field !w-28 !px-2" defaultValue={h?.closesAt ?? "21:00"} />
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name={`open_${dow}`} defaultChecked={h?.isOpen ?? dow !== 0} className="h-4 w-4 accent-acid" /> Open
                    </label>
                  </div>
                );
              })}
            </div>
            <button type="submit" className="btn-primary mt-5 w-full">
              Save hours
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
