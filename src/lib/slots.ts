import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, studioHours } from "@/db/schema";
import { minutesToTime, timeToMinutes } from "./format";

const PENDING_HOLD_MINUTES = 30;
const SLOT_STEP_MINUTES = 60;

export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

type Interval = { start: number; end: number };

async function busyIntervals(date: string, excludeBookingId?: number): Promise<Interval[]> {
  const rows = await db
    .select({
      id: bookings.id,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.bookingDate, date),
        inArray(bookings.status, ["pending_payment", "confirmed", "completed"]),
      ),
    );
  const holdCutoff = Date.now() - PENDING_HOLD_MINUTES * 60 * 1000;
  return rows
    .filter((r) => r.id !== excludeBookingId)
    .filter((r) => r.status !== "pending_payment" || r.createdAt.getTime() > holdCutoff)
    .map((r) => ({ start: timeToMinutes(r.startTime), end: timeToMinutes(r.endTime) }));
}

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

export type SlotResult = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  slots: string[];
};

export async function getAvailableSlots(date: string, hours: number): Promise<SlotResult> {
  if (!isValidDateString(date)) return { open: false, opensAt: "", closesAt: "", slots: [] };
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const [day] = await db.select().from(studioHours).where(eq(studioHours.dayOfWeek, dow)).limit(1);
  if (!day || !day.isOpen) return { open: false, opensAt: "", closesAt: "", slots: [] };

  const open = timeToMinutes(day.opensAt);
  const close = timeToMinutes(day.closesAt);
  const busy = await busyIntervals(date);
  const durationMin = hours * 60;

  // Ghana runs on UTC, so "now" in UTC is local studio time.
  const now = new Date();
  const isToday = date === todayString();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const slots: string[] = [];
  for (let start = open; start + durationMin <= close; start += SLOT_STEP_MINUTES) {
    if (isToday && start < nowMinutes + 60) continue;
    const candidate = { start, end: start + durationMin };
    if (busy.some((b) => overlaps(b, candidate))) continue;
    slots.push(minutesToTime(start));
  }
  return { open: true, opensAt: day.opensAt, closesAt: day.closesAt, slots };
}

export async function isSlotAvailable(date: string, startTime: string, hours: number): Promise<boolean> {
  const result = await getAvailableSlots(date, hours);
  return result.open && result.slots.includes(startTime);
}
