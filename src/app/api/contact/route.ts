import { ContactError, createContactMessage } from "@/lib/contact";

export const dynamic = "force-dynamic";

/**
 * Public contact form endpoint (see src/components/contact-form.tsx).
 *
 * A plain in-memory throttle keeps one bored visitor from filling the inbox;
 * it is per server instance, which is enough for a form that also stores every
 * submission in the database.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function throttled(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.every((t) => now - t > WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (throttled(ip)) {
    return Response.json({ error: "That is a lot of messages — please wait a minute and try again." }, { status: 429 });
  }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Hidden field that only a bot would fill in.
  if (String(payload.company ?? "").trim()) return Response.json({ ok: true });

  try {
    await createContactMessage({
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      phone: String(payload.phone ?? ""),
      topic: String(payload.topic ?? ""),
      orderReference: String(payload.orderReference ?? ""),
      body: String(payload.body ?? ""),
      source: String(payload.source ?? "contact"),
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ContactError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[api/contact]", err);
    return Response.json({ error: "Could not send that message. Please email us instead." }, { status: 500 });
  }
}
