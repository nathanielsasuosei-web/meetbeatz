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
 *   WHATSAPP_ALERT_TEMPLATE    approved template for proactive alerts (recommended)
 *   WHATSAPP_ALERT_LANGUAGE    template language, defaults to en_US
 *   WHATSAPP_GRAPH_VERSION     optional, defaults to v19.0
 *
 * Meta only permits free-form text outside an active 24-hour conversation. If
 * WHATSAPP_ALERT_TEMPLATE is set, alerts use an approved one-variable template
 * and work even when the producer has not messaged the business number first.
 * Without it, text mode is useful for the Meta test recipient or an existing
 * 24-hour conversation. Everything here fails soft so checkout never breaks
 * because of WhatsApp.
 */

export type WhatsAppResult =
  | { status: "sent"; messageId?: string }
  | { status: "skipped"; detail: string }
  | { status: "error"; detail: string };

type WhatsAppConfig = {
  token: string;
  phoneId: string;
  version: string;
  templateName: string | null;
  templateLanguage: string;
  defaultCountryCode: string;
};

const DEFAULT_GRAPH_VERSION = "v19.0";
const DEFAULT_TEMPLATE_LANGUAGE = "en_US";
const DEFAULT_COUNTRY_CODE = "233";
const SEND_TIMEOUT_MS = 10_000;

function graphVersion(value: string | undefined): string {
  const cleaned = value?.trim();
  if (!cleaned) return DEFAULT_GRAPH_VERSION;
  return cleaned.toLowerCase().startsWith("v") ? cleaned : `v${cleaned}`;
}

export function whatsappConfig(): WhatsAppConfig | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) return null;

  const configuredCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.replace(/\D/g, "").trim();
  return {
    token,
    phoneId,
    version: graphVersion(process.env.WHATSAPP_GRAPH_VERSION),
    templateName: process.env.WHATSAPP_ALERT_TEMPLATE?.trim() || null,
    templateLanguage: process.env.WHATSAPP_ALERT_LANGUAGE?.trim() || DEFAULT_TEMPLATE_LANGUAGE,
    defaultCountryCode: configuredCountryCode || DEFAULT_COUNTRY_CODE,
  };
}

/** True when the Cloud API credentials are present (used for status chips). */
export function isWhatsAppConfigured(): boolean {
  return whatsappConfig() !== null;
}

/**
 * Converts the producer's input to the digits-only E.164 value Meta expects.
 * International numbers can be entered as +233…, 00233…, or 233…. For the
 * Ghanaian studio, a local 024… number is also expanded using 233 by default.
 */
export function normalizeWhatsAppNumber(value: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const raw = value.trim();
  if (!raw) return "";

  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  else if (raw.startsWith("+") && digits.startsWith("00")) digits = digits.slice(2);

  const code = countryCode.replace(/\D/g, "");
  if (code && digits.startsWith("0")) digits = `${code}${digits.slice(1)}`;
  return digits;
}

function messagePayload(cfg: WhatsAppConfig, to: string, body: string): Record<string, unknown> {
  const text = body.slice(0, 1024);
  if (cfg.templateName) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: cfg.templateName,
        language: { code: cfg.templateLanguage },
        // Create the approved template with one body variable: {{1}}.
        components: [{ type: "body", parameters: [{ type: "text", text }] }],
      },
    };
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  };
}

/**
 * Sends a booking message to `to`. `to` may be entered as +233 24 000 0000,
 * 00233…, or a local Ghanaian number. Never throws — returns a result
 * describing what happened so a delivery problem cannot fail checkout.
 */
export async function sendWhatsAppAlert(to: string, body: string): Promise<WhatsAppResult> {
  const cfg = whatsappConfig();
  if (!cfg) {
    return { status: "skipped", detail: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set" };
  }

  const digits = normalizeWhatsAppNumber(to, cfg.defaultCountryCode);
  if (digits.length < 8 || digits.length > 15) {
    return { status: "skipped", detail: `alert number is not a valid international phone number ("${to}")` };
  }
  const text = body.trim();
  if (!text) return { status: "skipped", detail: "alert message is empty" };

  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.phoneId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload(cfg, digits, text)),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      return { status: "error", detail: `HTTP ${res.status}: ${data.error?.message ?? "unknown error"}` };
    }
    const messageId = data.messages?.[0]?.id;
    if (!messageId) {
      return { status: "error", detail: "API accepted the request but returned no message id" };
    }
    return { status: "sent", messageId };
  } catch (err) {
    return { status: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}
