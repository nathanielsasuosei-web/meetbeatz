import { createHmac } from "crypto";
import { getAdminSession } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Authenticated ICE config. Coturn's REST shared-secret mode gets short-lived credentials. */
export async function GET() {
  const [artist, producer] = await Promise.all([getCustomerSession(), getAdminSession()]);
  if (!artist && !producer) return Response.json({ error: "Sign in to use audio calls." }, { status: 401 });

  const iceServers: Array<Record<string, string | string[]>> = [{ urls: "stun:stun.l.google.com:19302" }];
  const urls = (process.env.TURN_SERVER_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => /^(turn|turns):/i.test(url));
  const sharedSecret = process.env.TURN_SHARED_SECRET?.trim();

  if (urls.length && sharedSecret) {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const role = producer ? "producer" : "artist";
    const actorId = producer?.id ?? artist!.id;
    const username = `${expiresAt}:${role}:${actorId}`;
    const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
    iceServers.push({ urls, username, credential });
  }

  return Response.json({ iceServers });
}
