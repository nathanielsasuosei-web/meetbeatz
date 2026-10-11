/**
 * WhatsApp alerts for the producer, via Meta's WhatsApp Business Cloud API.
 *
 * The API sends FROM the business-verified phone number (WHATSAPP_PHONE_NUMBER_ID)
 * TO the recipient. That means the number the producer picks for alerts
 * (settings.whatsappAlerts) must be a different WhatsApp number than the
 * business number — e.g. the producer's personal SIM.
 *
 * Setup (all environment variables, read server-side only):
 *   WHATSAPP_ACCESS_TOKEN      permanent token from Meta for the WABA
 *   WHATSAPP_PHONE_NUMBER_ID   the verified number that sends the alerts
 *   WHATSAPP_GRAPH_VERSION     optional, defaults to v19.0
 *
 * Everything here fails soft: when unconfigured the calls are a no-op with a
 * reason, so checkout and the site never break because of WhatsApp.
 */

export type WhatsAppResult =
  | { status: "sent" }
  | { status: "skipped"; detail: string }
  | { status: "error"; detail: string };

const DEFAULT_GRAPH_VERSION = "v19.0";
const SEND_TIMEOUT_MS = 10_000;

export function whatsappConfig(): { token: string; phoneId: string; version: string } | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) return null;
  return {
    token,
    phoneId,
    version: process.env.WHATSAPP_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
  };
}

/** True when the Cloud API credentials are present (used for status chips). */
export function isWhatsAppConfigured(): boolean {
  return whatsappConfig() !== null;
}

/**
 * Sends a plain-text WhatsApp message to `to` (international format, e.g.
 * +233240000000). Never throws — returns a result describing what happened.
 */
export async function sendWhatsAppAlert(to: string, body: string): Promise<WhatsAppResult> {
  const cfg = whatsappConfig();
  if (!cfg) {
    return { status: "skipped", detail: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set" };
  }
  const digits = to.replace(/\D/g, "");
  if (digits.length < 8) {
    return { status: "skipped", detail: `alert number is not a valid phone number ("${to}")` };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.version}/${cfg.phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits,
        type: "text",
        text: { preview_url: false, body: body.slice(0, 1024) },
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code?: number };
    };
    if (!res.ok) {
      return { status: "error", detail: `HTTP ${res.status}: ${data.error?.message ?? "unknown error"}` };
    }
    if (!data.messages?.length) {
      return { status: "error", detail: "API accepted the request but returned no message id" };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}
