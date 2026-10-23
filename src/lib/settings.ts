import { db } from "@/db";
import { settings } from "@/db/schema";
import { sql } from "drizzle-orm";
import {
  DEFAULT_BACKGROUND_SETTINGS,
  normalizeBackgroundStyle,
  normalizeHeroImage,
  normalizeHeroOpacity,
  normalizeHexColor,
  normalizeIntensity,
  type BackgroundStyle,
} from "./background-theme";
import { normalizeScreenGuardMode, type ScreenGuardMode } from "./screen-guard";

export type SiteSettings = {
  siteName: string;
  tagline: string;
  /** Main neon accent used by the storefront glass UI and hero. */
  accentColor: string;
  /** Website backdrop rendering style (`liquid`, `aurora`, or `solid`). */
  bgStyle: BackgroundStyle;
  /** Primary glow colour for the full-page backdrop & glass surfaces. */
  bgPrimaryColor: string;
  /** Secondary ambient wash colour for depth gradients. */
  bgSecondaryColor: string;
  /** Base canvas colour behind the entire website. */
  bgBaseColor: string;
  /** Glow intensity percentage (0–150). */
  bgIntensity: string;
  /** Homepage hero banner photo path (`"none"`, `/images/...`, or `/api/media/backgrounds/...`). */
  heroImage: string;
  /** Homepage hero banner photo opacity percentage (5–90). */
  heroImageOpacity: string;
  currency: string;
  feePercent: string;
  /** One optional site-wide promo code configured by the producer. */
  promoCode: string;
  promoPercent: string;
  /** ISO or datetime-local value; blank means the campaign has no end date. */
  promoExpiresAt: string;
  paystackSubaccount: string;
  feeBearer: "account" | "subaccount";
  contactEmail: string;
  contactPhone: string;
  whatsapp: string;
  location: string;
  instagram: string;
  notifyEmail: string;
  /** Producer's WhatsApp number that receives booking alerts (Cloud API recipient). */
  whatsappAlerts: string;
  bookingPolicy: string;
  /**
   * Screen-capture guard mode for the storefront: `off`, `watermark` (trace and
   * warn) or `block` (also hide the artwork when focus is lost). See
   * src/lib/screen-guard.ts for what each layer can and cannot stop.
   */
  screenGuard: ScreenGuardMode;
  /** "1" when the producer has opened Live Recording to artists; "0" while "Coming soon". */
  liveRecordingOpen: string;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Meetbeatz",
  tagline: "Premium beats & studio sessions. Pay with Mobile Money, get your files instantly.",
  accentColor: "#c6f135",
  bgStyle: DEFAULT_BACKGROUND_SETTINGS.bgStyle,
  bgPrimaryColor: DEFAULT_BACKGROUND_SETTINGS.bgPrimaryColor,
  bgSecondaryColor: DEFAULT_BACKGROUND_SETTINGS.bgSecondaryColor,
  bgBaseColor: DEFAULT_BACKGROUND_SETTINGS.bgBaseColor,
  bgIntensity: DEFAULT_BACKGROUND_SETTINGS.bgIntensity,
  heroImage: DEFAULT_BACKGROUND_SETTINGS.heroImage,
  heroImageOpacity: DEFAULT_BACKGROUND_SETTINGS.heroImageOpacity,
  currency: "GHS",
  feePercent: "10",
  promoCode: "MB5X9R2K7Q4N",
  promoPercent: "5",
  promoExpiresAt: "",
  paystackSubaccount: "SPL_u2dhKWTU3y",
  feeBearer: "account",
  contactEmail: "hello@meetbeatz.com",
  contactPhone: "+233 20 000 0000",
  whatsapp: "",
  location: "Accra, Ghana",
  instagram: "@meetbeatz",
  notifyEmail: "",
  whatsappAlerts: "",
  screenGuard: "block",
  bookingPolicy:
    "Please arrive 10 minutes before your session. The balance is payable at the studio before the session starts. Reschedule at least 24 hours in advance to keep your deposit.",
  liveRecordingOpen: "0",
};

const RETIRED_PROMO_CODES = new Set(["MEETBEATZ5"]);

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.select().from(settings);
  const merged: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[row.key] = row.value;
  // Replace the code generated in the previous campaign even when an older
  // database still has it persisted. Admin-configured newer codes are kept.
  if (RETIRED_PROMO_CODES.has(merged.promoCode.trim().toUpperCase())) {
    merged.promoCode = DEFAULT_SETTINGS.promoCode;
    merged.promoPercent = "5";
  }
  const asStrings = merged as unknown as SiteSettings;
  // The value is free text in the database, so it is normalised on the way out —
  // a typo there must not silently switch content protection off.
  return {
    ...asStrings,
    accentColor: normalizeHexColor(asStrings.accentColor, DEFAULT_SETTINGS.accentColor),
    bgStyle: normalizeBackgroundStyle(asStrings.bgStyle),
    bgPrimaryColor: normalizeHexColor(asStrings.bgPrimaryColor, DEFAULT_SETTINGS.bgPrimaryColor),
    bgSecondaryColor: normalizeHexColor(asStrings.bgSecondaryColor, DEFAULT_SETTINGS.bgSecondaryColor),
    bgBaseColor: normalizeHexColor(asStrings.bgBaseColor, DEFAULT_SETTINGS.bgBaseColor),
    bgIntensity: String(normalizeIntensity(asStrings.bgIntensity)),
    heroImage: normalizeHeroImage(asStrings.heroImage),
    heroImageOpacity: String(normalizeHeroOpacity(asStrings.heroImageOpacity)),
    screenGuard: normalizeScreenGuardMode(asStrings.screenGuard),
  };
}

export function getPromoConfig(siteSettings: SiteSettings): { code: string; percent: number; expiresAt: string | null } | null {
  const code = siteSettings.promoCode.trim().toUpperCase();
  // Promo codes are intentionally alphanumeric, mixed, and at least ten
  // characters long so a live code is difficult to guess or mistype.
  if (!/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{10,64}$/.test(code)) return null;

  const rawExpiry = siteSettings.promoExpiresAt.trim();
  if (rawExpiry) {
    const expiry = new Date(rawExpiry);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) return null;
    return { code, percent: 5, expiresAt: expiry.toISOString() };
  }

  // This campaign is fixed at 5%; do not trust a persisted/browser-supplied
  // percentage to change the discount.
  return { code, percent: 5, expiresAt: null };
}

export function isLiveRecordingOpen(siteSettings: SiteSettings): boolean {
  return siteSettings.liveRecordingOpen === "1";
}

export async function saveSettings(partial: Partial<Record<keyof SiteSettings, string>>) {
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    await db
      .insert(settings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: sql`now()` },
      });
  }
}

export type PaymentMode = "paystack" | "simulation";

export function getPaymentMode(): PaymentMode {
  if (process.env.PAYMENT_MODE === "simulation") return "simulation";
  return process.env.PAYSTACK_SECRET_KEY?.trim() ? "paystack" : "simulation";
}

export function emailProvider(): "smtp" | "resend" | "none" {
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  return "none";
}
