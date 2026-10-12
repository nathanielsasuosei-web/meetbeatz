import { db } from "@/db";
import { settings } from "@/db/schema";
import { sql } from "drizzle-orm";

export type SiteSettings = {
  siteName: string;
  tagline: string;
  /** Main neon accent used by the storefront glass UI and hero. */
  accentColor: string;
  currency: string;
  feePercent: string;
  /** One optional site-wide promo code configured by the producer. */
  promoCode: string;
  promoPercent: string;
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
};

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Meetbeatz",
  tagline: "Premium beats & studio sessions. Pay with Mobile Money, get your files instantly.",
  accentColor: "#c6f135",
  currency: "GHS",
  feePercent: "10",
  promoCode: "MEETBEATZ5",
  promoPercent: "5",
  paystackSubaccount: "SPL_u2dhKWTU3y",
  feeBearer: "account",
  contactEmail: "hello@meetbeatz.com",
  contactPhone: "+233 20 000 0000",
  whatsapp: "",
  location: "Accra, Ghana",
  instagram: "@meetbeatz",
  notifyEmail: "",
  whatsappAlerts: "",
  bookingPolicy:
    "Please arrive 10 minutes before your session. The balance is payable at the studio before the session starts. Reschedule at least 24 hours in advance to keep your deposit.",
};

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.select().from(settings);
  const merged: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[row.key] = row.value;
  return merged as unknown as SiteSettings;
}

export function getPromoConfig(siteSettings: SiteSettings): { code: string; percent: number } | null {
  const code = siteSettings.promoCode.trim().toUpperCase();
  const rawPercent = Number.parseFloat(siteSettings.promoPercent);
  const percent = Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 0;
  return code && percent > 0 ? { code, percent } : null;
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
