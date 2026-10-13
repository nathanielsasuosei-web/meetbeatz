import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, voiceCallSignals, voiceCalls, type VoiceCall } from "@/db/schema";
import { getAdminSession } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["ringing", "accepted"] as const;
const SIGNAL_KINDS = ["offer", "answer", "ice-candidate"] as const;

type CallRole = "artist" | "producer";
type Actor =
  | { role: "artist"; id: number; customerId: number }
  | { role: "producer"; id: number; customerId: null };

async function getActor(): Promise<Actor | null> {
  const producer = await getAdminSession();
  if (producer) return { role: "producer", id: producer.id, customerId: null };
  const artist = await getCustomerSession();
  if (artist) return { role: "artist", id: artist.id, customerId: artist.id };
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
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in as an artist or producer to use audio calls." }, { status: 401 });

  const url = new URL(req.url);
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
    call = missed ?? await getCallForActor(expiredCallId, actor);
  }

  if (!call) return Response.json({ call: null, signals: [] });

  const after = Number(url.searchParams.get("after") ?? 0);
  const cursor = Number.isSafeInteger(after) && after >= 0 ? after : 0;
  const [signals, [artist]] = await Promise.all([
    db
      .select()
      .from(voiceCallSignals)
      .where(and(eq(voiceCallSignals.callId, call.id), eq(voiceCallSignals.recipientRole, actor.role), gt(voiceCallSignals.id, cursor)))
      .orderBy(asc(voiceCallSignals.id))
      .limit(100),
    actor.role === "producer"
      ? db.select({ name: customers.name }).from(customers).where(eq(customers.id, call.customerId)).limit(1)
      : Promise.resolve([] as { name: string }[]),
  ]);

  return Response.json({
    call,
    customerName: artist?.name ?? null,
    signals,
  });
}

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in as an artist or producer to use audio calls." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as
    | { action?: string; callId?: number; kind?: string; payload?: unknown }
    | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });

  if (body.action === "start") {
    if (actor.role !== "artist" || actor.customerId === null) {
      return Response.json({ error: "Only an artist can start a call to the producer." }, { status: 403 });
    }
    const result = await db.transaction(async (tx) => {
      // Only one producer call can ring or be active at a time. Serialize starts
      // so two artists cannot both grab the producer simultaneously.
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
      const [created] = await tx.insert(voiceCalls).values({ customerId: actor.customerId, status: "ringing" }).returning();
      return { call: created, started: true };
    });
    if (!result.started && result.call.customerId !== actor.customerId) {
      return Response.json({ error: "The producer is already on another call. Please try again shortly." }, { status: 409 });
    }
    return Response.json({ call: result.call, existing: !result.started }, { status: result.started ? 201 : 200 });
  }

  const callId = parseCallId(body.callId);
  if (!callId) return Response.json({ error: "Invalid call." }, { status: 400 });
  const call = await getCallForActor(callId, actor);
  if (!call) return Response.json({ error: "Call not found." }, { status: 404 });

  if (body.action === "accept" || body.action === "decline") {
    if (actor.role !== "producer") return Response.json({ error: "Only the producer can answer an incoming call." }, { status: 403 });
    if (call.status !== "ringing") return Response.json({ error: "This call is no longer ringing." }, { status: 409 });
    const nextStatus = body.action === "accept" ? "accepted" : "declined";
    const [updated] = await db
      .update(voiceCalls)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(voiceCalls.id, callId), eq(voiceCalls.status, "ringing")))
      .returning();
    if (!updated) return Response.json({ error: "This call has already been answered." }, { status: 409 });
    if (nextStatus === "declined") await db.delete(voiceCallSignals).where(eq(voiceCallSignals.callId, callId));
    return Response.json({ call: updated });
  }

  if (body.action === "cancel" || body.action === "end") {
    if (body.action === "cancel" && actor.role !== "artist") {
      return Response.json({ error: "Only the artist can cancel an unanswered call." }, { status: 403 });
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
    await db.delete(voiceCallSignals).where(eq(voiceCallSignals.callId, callId));
    return Response.json({ call: updated });
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
