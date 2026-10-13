import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, voiceCallSignals, voiceCalls, type VoiceCall } from "@/db/schema";
import { getAdminSession, hashPassword } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["ringing", "accepted"] as const;
const SIGNAL_KINDS = ["offer", "answer", "ice-candidate"] as const;
const GUEST_ARTIST_EMAIL = "artist-caller@meetbeatz.local";

type CallRole = "artist" | "producer";
type Actor =
  | { role: "artist"; id: number; customerId: number }
  | { role: "producer"; id: number; customerId: null };

export type CallableArtist = {
  id: number;
  name: string;
  email: string;
};

async function ensureGuestArtistId(): Promise<number> {
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, GUEST_ARTIST_EMAIL))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(customers)
    .values({
      email: GUEST_ARTIST_EMAIL,
      name: "Artist",
      passwordHash: hashPassword("guest-artist-call-only"),
    })
    .onConflictDoNothing()
    .returning({ id: customers.id });
  if (created) return created.id;

  const [retry] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, GUEST_ARTIST_EMAIL))
    .limit(1);
  return retry.id;
}

async function listCallableArtists(): Promise<CallableArtist[]> {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
    })
    .from(customers)
    .where(ne(customers.email, GUEST_ARTIST_EMAIL))
    .orderBy(asc(customers.name), desc(customers.id))
    .limit(100);
  return rows;
}

async function getCallerRole(callId: number): Promise<CallRole> {
  const [ringSignal] = await db
    .select({ senderRole: voiceCallSignals.senderRole })
    .from(voiceCallSignals)
    .where(and(eq(voiceCallSignals.callId, callId), eq(voiceCallSignals.kind, "ring")))
    .orderBy(asc(voiceCallSignals.id))
    .limit(1);
  return ringSignal?.senderRole === "producer" ? "producer" : "artist";
}

async function getActor(requestedRole?: string | null): Promise<Actor | null> {
  const [artist, producer] = await Promise.all([getCustomerSession(), getAdminSession()]);

  if (requestedRole === "producer") {
    if (producer) return { role: "producer", id: producer.id, customerId: null };
    return null;
  }

  if (requestedRole === "artist") {
    if (artist) return { role: "artist", id: artist.id, customerId: artist.id };
    const guestId = await ensureGuestArtistId();
    return { role: "artist", id: guestId, customerId: guestId };
  }

  if (artist) return { role: "artist", id: artist.id, customerId: artist.id };
  if (producer) return { role: "producer", id: producer.id, customerId: null };
  return null;
}

async function getCallForActor(callId: number, actor: Actor): Promise<VoiceCall | null> {
  const [call] = await db.select().from(voiceCalls).where(eq(voiceCalls.id, callId)).limit(1);
  if (!call || (actor.role === "artist" && call.customerId !== actor.customerId)) return null;
  return call;
}

function parseCallId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestedRole = url.searchParams.get("role");
  const actor = await getActor(requestedRole);
  if (!actor) return Response.json({ error: "Sign in as an artist or producer to use audio calls." }, { status: 401 });

  const requestedId = url.searchParams.get("callId");
  let call: VoiceCall | null = null;

  if (requestedId) {
    const callId = parseCallId(requestedId);
    if (!callId) return Response.json({ error: "Invalid call." }, { status: 400 });
    call = await getCallForActor(callId, actor);
    if (!call) return Response.json({ error: "Call not found." }, { status: 404 });
  } else if (actor.role === "artist") {
    const [active] = await db
      .select()
      .from(voiceCalls)
      .where(and(eq(voiceCalls.customerId, actor.customerId!), inArray(voiceCalls.status, [...ACTIVE_STATUSES])))
      .orderBy(desc(voiceCalls.createdAt), desc(voiceCalls.id))
      .limit(1);
    call = active ?? null;
  } else {
    const [active] = await db
      .select()
      .from(voiceCalls)
      .where(inArray(voiceCalls.status, [...ACTIVE_STATUSES]))
      .orderBy(desc(voiceCalls.createdAt), desc(voiceCalls.id))
      .limit(1);
    call = active ?? null;
  }

  if (call?.status === "ringing" && call.createdAt.getTime() < Date.now() - 90_000) {
    const expiredCallId = call.id;
    const [missed] = await db
      .update(voiceCalls)
      .set({ status: "missed", updatedAt: new Date() })
      .where(and(eq(voiceCalls.id, expiredCallId), eq(voiceCalls.status, "ringing")))
      .returning();
    call = missed ?? (await getCallForActor(expiredCallId, actor));
  }

  const artists = actor.role === "producer" ? await listCallableArtists() : undefined;

  if (!call) return Response.json({ call: null, signals: [], artists });

  const after = Number(url.searchParams.get("after") ?? 0);
  const cursor = Number.isSafeInteger(after) && after >= 0 ? after : 0;
  const [signals, [artist], callerRole] = await Promise.all([
    db
      .select()
      .from(voiceCallSignals)
      .where(
        and(
          eq(voiceCallSignals.callId, call.id),
          eq(voiceCallSignals.recipientRole, actor.role as CallRole),
          inArray(voiceCallSignals.kind, [...SIGNAL_KINDS]),
          gt(voiceCallSignals.id, cursor),
        ),
      )
      .orderBy(asc(voiceCallSignals.id))
      .limit(100),
    db.select({ name: customers.name }).from(customers).where(eq(customers.id, call.customerId)).limit(1),
    getCallerRole(call.id),
  ]);

  return Response.json({
    call: { ...call, callerRole },
    customerName: artist?.name ?? null,
    signals,
    artists,
  });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as
    | { action?: string; callId?: number; customerId?: number; kind?: string; payload?: unknown; role?: string }
    | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });

  const requestedRole =
    typeof body.role === "string"
      ? body.role
      : url.searchParams.get("role") ?? (body.action === "start" || body.action === "cancel" ? "artist" : null);
  const actor = await getActor(requestedRole);
  if (!actor) return Response.json({ error: "Sign in as an artist or producer to use audio calls." }, { status: 401 });

  if (body.action === "start") {
    let targetCustomerId: number;
    let targetCustomerName: string | null = null;
    const callerRole: CallRole = actor.role;

    if (actor.role === "artist") {
      if (actor.customerId === null) {
        return Response.json({ error: "Could not identify the artist account." }, { status: 403 });
      }
      targetCustomerId = actor.customerId;
    } else {
      // Producer calling a registered artist who has an account
      const requestedCustomerId = parseCallId(body.customerId);
      if (!requestedCustomerId) {
        return Response.json({ error: "Select a registered artist with an account to call." }, { status: 400 });
      }
      const [targetCustomer] = await db
        .select({ id: customers.id, name: customers.name, email: customers.email })
        .from(customers)
        .where(and(eq(customers.id, requestedCustomerId), ne(customers.email, GUEST_ARTIST_EMAIL)))
        .limit(1);
      if (!targetCustomer) {
        return Response.json({ error: "Only artists with a registered account can be called directly." }, { status: 404 });
      }
      targetCustomerId = targetCustomer.id;
      targetCustomerName = targetCustomer.name;
    }

    const result = await db.transaction(async (tx) => {
      // Only one studio call can ring or be active at a time.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meetbeatz-audio-call'))`);
      await tx
        .update(voiceCalls)
        .set({ status: "missed", updatedAt: new Date() })
        .where(and(eq(voiceCalls.status, "ringing"), lt(voiceCalls.createdAt, new Date(Date.now() - 90_000))));
      const [active] = await tx
        .select()
        .from(voiceCalls)
        .where(inArray(voiceCalls.status, [...ACTIVE_STATUSES]))
        .orderBy(desc(voiceCalls.createdAt), desc(voiceCalls.id))
        .limit(1);
      if (active) return { call: active, started: false };
      const [created] = await tx
        .insert(voiceCalls)
        .values({ customerId: targetCustomerId, status: "ringing" })
        .returning();
      await tx.insert(voiceCallSignals).values({
        callId: created.id,
        senderRole: callerRole,
        recipientRole: callerRole === "artist" ? "producer" : "artist",
        kind: "ring",
        payload: { callerRole },
      });
      return { call: created, started: true };
    });

    if (!result.started && result.call.customerId !== targetCustomerId) {
      return Response.json(
        {
          error:
            actor.role === "producer"
              ? "Another audio call is already active. Hang up or finish that call first."
              : "The producer is already on another call. Please try again shortly.",
        },
        { status: 409 },
      );
    }

    const activeCallerRole = result.started ? callerRole : await getCallerRole(result.call.id);
    return Response.json(
      {
        call: { ...result.call, callerRole: activeCallerRole },
        customerName: targetCustomerName,
        existing: !result.started,
      },
      { status: result.started ? 201 : 200 },
    );
  }

  const callId = parseCallId(body.callId);
  if (!callId) return Response.json({ error: "Invalid call." }, { status: 400 });
  const call = await getCallForActor(callId, actor);
  if (!call) return Response.json({ error: "Call not found." }, { status: 404 });

  const callerRole = await getCallerRole(callId);
  const calleeRole: CallRole = callerRole === "artist" ? "producer" : "artist";

  if (body.action === "accept" || body.action === "decline") {
    if (actor.role !== calleeRole) {
      return Response.json(
        {
          error:
            calleeRole === "producer"
              ? "Only the producer can answer an incoming artist call."
              : "Only the artist being called can answer this call.",
        },
        { status: 403 },
      );
    }
    if (call.status !== "ringing") return Response.json({ error: "This call is no longer ringing." }, { status: 409 });
    const nextStatus = body.action === "accept" ? "accepted" : "declined";
    const [updated] = await db
      .update(voiceCalls)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(voiceCalls.id, callId), eq(voiceCalls.status, "ringing")))
      .returning();
    if (!updated) return Response.json({ error: "This call has already been answered." }, { status: 409 });
    if (nextStatus === "declined") {
      await db
        .delete(voiceCallSignals)
        .where(and(eq(voiceCallSignals.callId, callId), inArray(voiceCallSignals.kind, [...SIGNAL_KINDS])));
    }
    return Response.json({ call: { ...updated, callerRole } });
  }

  if (body.action === "cancel" || body.action === "end") {
    if (body.action === "cancel" && actor.role !== callerRole) {
      return Response.json({ error: "Only the caller can cancel an unanswered call." }, { status: 403 });
    }
    if (actor.role === "artist" && call.customerId !== actor.customerId) {
      return Response.json({ error: "You cannot end another artist's call." }, { status: 403 });
    }
    if (!(ACTIVE_STATUSES as readonly string[]).includes(call.status)) {
      return Response.json({ error: "This call has already ended." }, { status: 409 });
    }
    const nextStatus = body.action === "cancel" && call.status === "ringing" ? "cancelled" : "ended";
    const [updated] = await db
      .update(voiceCalls)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(voiceCalls.id, callId), inArray(voiceCalls.status, [...ACTIVE_STATUSES])))
      .returning();
    if (!updated) return Response.json({ error: "This call has already ended." }, { status: 409 });
    await db
      .delete(voiceCallSignals)
      .where(and(eq(voiceCallSignals.callId, callId), inArray(voiceCallSignals.kind, [...SIGNAL_KINDS])));
    return Response.json({ call: { ...updated, callerRole } });
  }

  if (body.action === "signal") {
    if (!(SIGNAL_KINDS as readonly string[]).includes(String(body.kind))) {
      return Response.json({ error: "Unsupported call signal." }, { status: 400 });
    }
    if (call.status !== "accepted") return Response.json({ error: "Accept the call before exchanging audio." }, { status: 409 });
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return Response.json({ error: "Invalid call signal." }, { status: 400 });
    }
    const kind = body.kind as (typeof SIGNAL_KINDS)[number];
    const payload = body.payload as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    if (!serialized || serialized.length > 20_000) return Response.json({ error: "Call signal is too large." }, { status: 413 });
    if ((kind === "offer" && actor.role !== "artist") || (kind === "answer" && actor.role !== "producer")) {
      return Response.json({ error: "Only the artist can offer audio; only the producer can answer." }, { status: 403 });
    }
    if (kind === "offer" || kind === "answer") {
      if (payload.type !== kind || typeof payload.sdp !== "string" || payload.sdp.length > 16_000) {
        return Response.json({ error: "Invalid audio session description." }, { status: 400 });
      }
    } else if (typeof payload.candidate !== "string" || payload.candidate.length > 4_000) {
      return Response.json({ error: "Invalid network candidate." }, { status: 400 });
    }

    const signal = await db.transaction(async (tx) => {
      const [lockedCall] = await tx
        .select({ status: voiceCalls.status })
        .from(voiceCalls)
        .where(eq(voiceCalls.id, callId))
        .for("update");
      if (lockedCall?.status !== "accepted") return null;
      const [created] = await tx
        .insert(voiceCallSignals)
        .values({
          callId,
          senderRole: actor.role,
          recipientRole: actor.role === "artist" ? "producer" : "artist",
          kind,
          payload,
        })
        .returning({ id: voiceCallSignals.id });
      return created ?? null;
    });
    if (!signal) return Response.json({ error: "The call has already ended." }, { status: 409 });
    return Response.json({ signalId: signal.id }, { status: 201 });
  }

  return Response.json({ error: "Unknown call action." }, { status: 400 });
}
