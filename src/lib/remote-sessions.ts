import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { beats, remoteSessions, type RemoteSession } from "@/db/schema";
import { getCustomerSession, normalizeEmail } from "./customer-auth";
import { isValidEmail } from "./email-address";
import { storedFileExists } from "./files";
import { makeReference } from "./ids";
import { notifyRemoteSession } from "./notifications";
import { SESSION_GOALS } from "./release";

/**
 * Online recording with the producer.
 *
 * The artist records takes in the browser studio (src/components/remote-recorder.tsx),
 * sends the best one here with a preferred time, and the producer confirms the
 * live session. Payment for the time itself runs through the ordinary studio
 * booking flow using the seeded `online-session` service, so this module owns
 * the request and the files, not the money.
 */

const VALID_GOALS = new Set<string>(SESSION_GOALS.map((goal) => goal.slug));

export type RemoteSessionInput = {
  artistName: string;
  artistEmail: string;
  artistPhone: string;
  preferredDate: string;
  preferredTime: string;
  beatId: number | null;
  goal: string;
  notes: string;
  takePath: string;
  takeName: string;
  takeSeconds: number;
};

export class SessionRequestError extends Error {}

/** Validates one submission. Every message here is shown to the artist verbatim. */
export async function createRemoteSession(input: RemoteSessionInput): Promise<RemoteSession> {
  const session = await getCustomerSession();
  if (!session) throw new SessionRequestError("Sign in to send a take to the producer.");

  const artistName = input.artistName.trim();
  const artistEmail = normalizeEmail(input.artistEmail);
  if (artistName.length < 2) throw new SessionRequestError("Please enter your artist name.");
  if (!isValidEmail(artistEmail)) throw new SessionRequestError("Please enter a valid email address.");
  // The session is filed against the signed-in account, so a different address
  // here would put it somewhere the artist cannot see.
  if (artistEmail !== session.email) throw new SessionRequestError("Use your account email so the session appears in your account.");

  const goal = VALID_GOALS.has(input.goal) ? input.goal : "vocals";
  const preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate) ? input.preferredDate : "";
  const preferredTime = /^\d{2}:\d{2}$/.test(input.preferredTime) ? input.preferredTime : "";
  if (preferredDate && preferredDate < new Date().toISOString().slice(0, 10)) {
    throw new SessionRequestError("That date has already passed — pick an upcoming day.");
  }

  // A take is optional (some artists just want to book the time), but when one
  // is named it has to exist in storage: a dangling path would show the producer
  // a play button that 404s.
  const takePath = input.takePath.trim();
  if (takePath && !(await storedFileExists(takePath))) {
    throw new SessionRequestError("That recording did not finish uploading. Please record or upload it again.");
  }

  const beatId = Number.isFinite(input.beatId ?? NaN) && (input.beatId ?? 0) > 0 ? input.beatId : null;
  let beatTitle = "";
  if (beatId) {
    const [beat] = await db.select({ title: beats.title }).from(beats).where(eq(beats.id, beatId)).limit(1);
    beatTitle = beat?.title ?? "";
  }

  const [created] = await db
    .insert(remoteSessions)
    .values({
      reference: makeReference("MBO"),
      customerId: session.id,
      artistName,
      artistEmail,
      artistPhone: input.artistPhone.trim().slice(0, 40),
      preferredDate,
      preferredTime,
      beatId,
      beatTitle,
      goal,
      notes: input.notes.trim().slice(0, 2000),
      takePath: takePath || null,
      takeName: input.takeName.trim().slice(0, 200),
      takeSeconds: Math.max(0, Math.min(24 * 3600, Math.round(input.takeSeconds || 0))),
      status: "requested",
    })
    .returning();

  try {
    await notifyRemoteSession(created, "requested");
  } catch (err) {
    // The request is already stored; a WhatsApp or inbox failure must not make
    // the artist think their take was lost.
    console.error("[remote-sessions] failed to notify producer", err);
  }

  return created;
}

export async function listRemoteSessions(limit = 200): Promise<RemoteSession[]> {
  return db
    .select()
    .from(remoteSessions)
    .orderBy(desc(remoteSessions.createdAt), desc(remoteSessions.id))
    .limit(Math.max(1, Math.min(500, limit)));
}

export async function listRemoteSessionsForCustomer(customer: { id: number; email: string }): Promise<RemoteSession[]> {
  const email = customer.email.toLowerCase();
  return db
    .select()
    .from(remoteSessions)
    .where(or(eq(remoteSessions.customerId, customer.id), sql`lower(${remoteSessions.artistEmail}) = ${email}`))
    .orderBy(desc(remoteSessions.createdAt), desc(remoteSessions.id));
}

export async function setRemoteSessionStatus(id: number, status: string, producerNote: string): Promise<RemoteSession | null> {
  const [updated] = await db
    .update(remoteSessions)
    .set({
      status,
      producerNote: producerNote.trim().slice(0, 2000),
      // "Scheduled" is the state that needs a time attached; the producer writes
      // it in the note when they confirm.
      scheduledAt: status === "scheduled" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(remoteSessions.id, id))
    .returning();

  if (updated) {
    try {
      await notifyRemoteSession(updated, status === "scheduled" ? "scheduled" : "updated");
    } catch (err) {
      console.error("[remote-sessions] failed to notify artist of status change", err);
    }
  }
  return updated ?? null;
}

/** Open requests, for the dashboard badge. */
export async function countOpenRemoteSessions(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(remoteSessions)
    .where(inArray(remoteSessions.status, ["requested", "scheduled"]));
  return count;
}
