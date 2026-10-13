import { createRemoteSession, SessionRequestError } from "@/lib/remote-sessions";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Sends a recorded take and a preferred time to the producer.
 *
 * Sign-in happens inside `createRemoteSession` (a take has to belong to
 * somebody), and the audio itself was already uploaded through `/api/uploads` —
 * this only carries the storage path, so a request body stays small no matter
 * how long the take is.
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as {
      artistName?: string;
      artistEmail?: string;
      artistPhone?: string;
      preferredDate?: string;
      preferredTime?: string;
      beatId?: number | string | null;
      goal?: string;
      notes?: string;
      takePath?: string;
      takeName?: string;
      takeSeconds?: number | string;
    };

    const session = await createRemoteSession({
      artistName: String(body.artistName ?? ""),
      artistEmail: String(body.artistEmail ?? ""),
      artistPhone: String(body.artistPhone ?? ""),
      preferredDate: String(body.preferredDate ?? ""),
      preferredTime: String(body.preferredTime ?? ""),
      beatId: body.beatId ? Number(body.beatId) : null,
      goal: String(body.goal ?? "vocals"),
      notes: String(body.notes ?? ""),
      takePath: String(body.takePath ?? ""),
      takeName: String(body.takeName ?? ""),
      takeSeconds: Number(body.takeSeconds ?? 0),
    });

    return Response.json({ ok: true, reference: session.reference, id: session.id });
  } catch (err) {
    if (err instanceof SessionRequestError) return Response.json({ error: err.message }, { status: 400 });
    const message = err instanceof Error ? err.message : "";
    // An expired upload session is a storage error the artist can act on.
    if (/upload/i.test(message)) return Response.json({ error: message }, { status: 400 });
    console.error("[remote-sessions]", err);
    return Response.json({ error: "Could not send that take. Please try again." }, { status: 500 });
  }
}
