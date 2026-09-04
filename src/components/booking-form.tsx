"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckoutForm } from "./checkout-form";
import { formatTime12, money, round2 } from "@/lib/format";

export type ServiceOption = {
  id: number;
  name: string;
  slug: string;
  description: string;
  pricePerHour: number;
  minHours: number;
  maxHours: number;
  depositPercent: number;
};

type SlotResponse = { open: boolean; opensAt: string; closesAt: string; slots: string[] };

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingForm({
  services,
  initialServiceId,
  feePercent,
  currency,
}: {
  services: ServiceOption[];
  initialServiceId: number | null;
  feePercent: number;
  currency: string;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [serviceId, setServiceId] = useState<number>(initialServiceId ?? services[0]?.id ?? 0);
  const service = services.find((s) => s.id === serviceId) ?? services[0];
  const [hours, setHours] = useState<number>(service?.minHours ?? 1);
  const [date, setDate] = useState<string>(addDays(new Date(), 1));
  const [slots, setSlots] = useState<SlotResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [startTime, setStartTime] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!service) return;
    setHours((h) => Math.min(Math.max(h, service.minHours), service.maxHours));
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    setStartTime("");
    if (!date) return;
    setLoadingSlots(true);
    fetch(`/api/studio/slots?date=${date}&hours=${hours}`)
      .then((r) => r.json())
      .then((json: SlotResponse) => {
        if (!cancelled) setSlots(json);
      })
      .catch(() => {
        if (!cancelled) setSlots({ open: false, opensAt: "", closesAt: "", slots: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, hours]);

  if (!service) {
    return <div className="card p-6 text-sm text-muted">Studio services are not available right now.</div>;
  }

  const sessionPrice = round2(service.pricePerHour * hours);
  const deposit = round2((sessionPrice * service.depositPercent) / 100);
  const fee = round2((deposit * feePercent) / 100);
  const totalNow = round2(deposit + fee);
  const balance = round2(sessionPrice - deposit);
  const hourOptions = Array.from({ length: service.maxHours - service.minHours + 1 }, (_, i) => service.minHours + i);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <div className="card p-5">
          <p className="label">1 · Service</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setServiceId(s.id)}
                className={`rounded-xl border p-3 text-left transition ${s.id === serviceId ? "border-acid bg-acid/10" : "border-line bg-ink-2 hover:border-line-2"}`}
              >
                <p className="text-sm font-bold">{s.name}</p>
                <p className="text-xs text-muted">{money(s.pricePerHour, currency)}/hr</p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{service.description}</p>
        </div>

        <div className="card p-5">
          <p className="label">2 · Date & duration</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted" htmlFor="bk-date">Date</label>
              <input id="bk-date" type="date" className="field" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted" htmlFor="bk-hours">Duration</label>
              <select id="bk-hours" className="field" value={hours} onChange={(e) => setHours(parseInt(e.target.value, 10))}>
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {h} hour{h > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <p className="label">3 · Start time</p>
          {loadingSlots ? (
            <p className="text-sm text-muted">Checking availability…</p>
          ) : !slots || !slots.open ? (
            <p className="text-sm text-muted">The studio is closed on this date. Please pick another day.</p>
          ) : slots.slots.length === 0 ? (
            <p className="text-sm text-muted">No {hours}-hour slots left on this date. Try a shorter session or another day.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                Open {formatTime12(slots.opensAt)} – {formatTime12(slots.closesAt)}. Tap a start time:
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStartTime(s)}
                    className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${startTime === s ? "border-acid bg-acid text-ink" : "border-line bg-ink-2 hover:border-line-2"}`}
                  >
                    {formatTime12(s)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card p-5">
          <p className="label">4 · Notes for the engineer (optional)</p>
          <textarea className="field min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Song title, number of tracks, references, anything we should prepare…" maxLength={1000} />
        </div>
      </div>

      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <p className="eyebrow">Summary</p>
          <p className="mt-2 text-xl font-bold">{service.name}</p>
          <p className="text-sm text-muted">
            {date || "Pick a date"} · {startTime ? `${formatTime12(startTime)} start` : "Pick a start time"} · {hours} hr{hours > 1 ? "s" : ""}
          </p>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between text-cream/80">
              <dt>Session ({hours} × {money(service.pricePerHour, currency)})</dt>
              <dd>{money(sessionPrice, currency)}</dd>
            </div>
            <div className="flex justify-between text-cream/80">
              <dt>Deposit to lock slot ({service.depositPercent}%)</dt>
              <dd>{money(deposit, currency)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Service fee ({feePercent}%)</dt>
              <dd>{money(fee, currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-black">
              <dt>Pay now</dt>
              <dd className="text-acid">{money(totalNow, currency)}</dd>
            </div>
            {balance > 0 && (
              <div className="flex justify-between text-xs text-muted">
                <dt>Balance at the studio</dt>
                <dd>{money(balance, currency)}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="card p-5">
          <p className="label">5 · Your details</p>
          <CheckoutForm
            endpoint="/api/checkout/booking"
            payload={{ serviceId: service.id, date, startTime, hours, notes }}
            buttonLabel={`Pay deposit ${money(totalNow, currency)}`}
            disabled={!startTime}
            disabledReason="Choose a date and start time above to continue."
          />
        </div>
      </div>
    </div>
  );
}
