import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { studioHours } from "@/db/schema";
import { BookingForm, type ServiceOption } from "@/components/booking-form";
import { listActiveServices } from "@/lib/catalog";
import { DAY_NAMES, formatTime12, money, num } from "@/lib/format";
import { getPaymentMode, getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Studio bookings" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service: serviceSlug } = await searchParams;
  const [settings, services, hours] = await Promise.all([
    getSettings(),
    listActiveServices(),
    db.select().from(studioHours).orderBy(asc(studioHours.dayOfWeek)),
  ]);
  const options: ServiceOption[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    pricePerHour: num(s.pricePerHour),
    minHours: s.minHours,
    maxHours: s.maxHours,
    depositPercent: s.depositPercent,
  }));
  const initial = options.find((o) => o.slug === serviceSlug)?.id ?? null;
  const mode = getPaymentMode();

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/studio.jpg" alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-linear-to-b from-ink/40 to-ink" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <p className="eyebrow">Studio bookings · {settings.location}</p>
          <h1 className="display mt-4 text-5xl md:text-7xl">Book your session.</h1>
          <p className="mt-5 max-w-xl text-base text-cream/80">
            Recording, mixing and mastering with {settings.siteName}. Pick a slot, pay the deposit with Mobile Money, and your confirmation is
            emailed instantly.
          </p>
          <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
            {services.map((s) => (
              <div key={s.id} className="rounded-2xl border border-line bg-ink/70 p-4 backdrop-blur">
                <p className="font-bold">{s.name}</p>
                <p className="display mt-1 text-2xl text-acid">{money(s.pricePerHour, settings.currency)}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  per hour · {s.minHours}–{s.maxHours} hrs · {s.depositPercent}% deposit
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        {mode === "simulation" && (
          <div className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <strong>Test mode:</strong> payments are simulated until <code>PAYSTACK_SECRET_KEY</code> is configured.
          </div>
        )}
        <BookingForm services={options} initialServiceId={initial} feePercent={num(settings.feePercent)} currency={settings.currency} />
      </section>

      <section className="border-t border-line bg-ink-2">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div>
            <p className="eyebrow">Opening hours</p>
            <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
              {hours.map((h) => (
                <li key={h.id} className="flex justify-between py-2.5">
                  <span className="font-semibold">{DAY_NAMES[h.dayOfWeek]}</span>
                  <span className={h.isOpen ? "text-cream/80" : "text-muted"}>
                    {h.isOpen ? `${formatTime12(h.opensAt)} – ${formatTime12(h.closesAt)}` : "Closed"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Booking policy</p>
            <p className="mt-4 text-sm leading-relaxed text-muted">{settings.bookingPolicy}</p>
            <p className="mt-4 text-sm text-muted">
              Questions? Call <a href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`} className="text-acid">{settings.contactPhone}</a> or email{" "}
              <a href={`mailto:${settings.contactEmail}`} className="text-acid">{settings.contactEmail}</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
