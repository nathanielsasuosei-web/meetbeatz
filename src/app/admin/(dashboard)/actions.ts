"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { beats, bookings, contactMessages, licenseTypes, orders, promoCodes, services, soundKits, storedFiles, studioHours } from "@/db/schema";
import { changeAdminPassword, destroyAdminSession, getAdminSession, verifyPassword } from "@/lib/auth";
import { admins } from "@/db/schema";
import { slugify } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import { emailLayout } from "@/lib/email-templates";
import { sendOrderEmails } from "@/lib/payments";
import { isPaystackConfigured, isValidSplitCode, subaccountIsUsable } from "@/lib/paystack";
import { isValidPromoCode } from "@/lib/promos";
import { getSettings, saveSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/url";
import { saveAdsTxt } from "@/lib/ads-txt";
import { validateAdsTxt } from "@/lib/ads-txt-format";
import { setContactHandled } from "@/lib/contact";
import { normalizeScreenGuardMode } from "@/lib/screen-guard";
import { setReleaseStatus, updatePlan } from "@/lib/distribution";
import { RELEASE_STATUSES, SESSION_STATUSES } from "@/lib/release";
import { setRemoteSessionStatus } from "@/lib/remote-sessions";
import { sendWhatsAppAlert } from "@/lib/whatsapp";

async function guard() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

function str(fd: FormData, key: string, fallback = ""): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : fallback;
}

function int(fd: FormData, key: string, fallback: number): number {
  const n = parseInt(str(fd, key), 10);
  return Number.isFinite(n) ? n : fallback;
}

function dec(fd: FormData, key: string, fallback = 0): string {
  const n = parseFloat(str(fd, key));
  return (Number.isFinite(n) ? Math.max(0, n) : fallback).toFixed(2);
}

function hexColor(fd: FormData, key: string, fallback: string): string {
  const value = str(fd, key).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(value) ? value : fallback;
}

const PROMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatedPromoCode(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, (byte) => PROMO_ALPHABET[byte % PROMO_ALPHABET.length]).join("");
}

function promoExpiry(fd: FormData): string {
  const raw = str(fd, "promoExpiresAt");
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) fail("/admin/settings", "Enter a valid promo-code end date.");
  return parsed.toISOString();
}

function done(path: string, message: string): never {
  revalidatePath(path);
  revalidatePath("/");
  redirect(`${path}?msg=${encodeURIComponent(message)}`);
}

function fail(path: string, message: string): never {
  redirect(`${path}?err=${encodeURIComponent(message)}`);
}

export async function logoutAction() {
  await destroyAdminSession();
  redirect("/admin/login");
}

// ---------------- Website enquiries ----------------
export async function toggleContactHandled(id: number, handled: boolean) {
  await guard();
  await setContactHandled(id, handled);
  revalidatePath("/admin/enquiries");
  done("/admin/enquiries", handled ? "Enquiry marked as answered." : "Enquiry moved back to the open list.");
}

export async function deleteContactMessage(id: number) {
  await guard();
  await db.delete(contactMessages).where(eq(contactMessages.id, id));
  done("/admin/enquiries", "Enquiry deleted.");
}

// ---------------- Beats ----------------
export async function toggleBeatPublished(id: number) {
  await guard();
  const [beat] = await db.select().from(beats).where(eq(beats.id, id)).limit(1);
  if (beat) await db.update(beats).set({ isPublished: !beat.isPublished, updatedAt: new Date() }).where(eq(beats.id, id));
  revalidatePath("/admin/beats");
  revalidatePath("/");
  revalidatePath("/beats");
}

export async function toggleBeatFeatured(id: number) {
  await guard();
  const [beat] = await db.select().from(beats).where(eq(beats.id, id)).limit(1);
  if (beat) await db.update(beats).set({ isFeatured: !beat.isFeatured, updatedAt: new Date() }).where(eq(beats.id, id));
  revalidatePath("/admin/beats");
  revalidatePath("/");
}

export async function deleteBeat(id: number) {
  await guard();
  const [beat] = await db.select().from(beats).where(eq(beats.id, id)).limit(1);
  if (beat) {
    await db.delete(beats).where(eq(beats.id, id));
    // A file can be shared by other uploaded beats. The storage cleanup only
    // removes it later if no remaining beat references it.
  }
  done("/admin/beats", "Beat deleted.");
}

// ---------------- Sound kits ----------------
export async function toggleSoundKitPublished(id: number) {
  await guard();
  const [kit] = await db.select().from(soundKits).where(eq(soundKits.id, id)).limit(1);
  if (kit) await db.update(soundKits).set({ isPublished: !kit.isPublished, updatedAt: new Date() }).where(eq(soundKits.id, id));
  revalidatePath("/admin/sound-kits");
  revalidatePath("/sound-kits");
  revalidatePath("/");
}

export async function deleteSoundKit(id: number) {
  await guard();
  const [kit] = await db.select().from(soundKits).where(eq(soundKits.id, id)).limit(1);
  if (kit) {
    await db.delete(soundKits).where(eq(soundKits.id, id));
    // Sound kits own their archive, so remove the stored file and its chunks too.
    await db.delete(storedFiles).where(eq(storedFiles.path, kit.filePath));
  }
  revalidatePath("/sound-kits");
  revalidatePath("/");
  done("/admin/sound-kits", "Sound kit deleted.");
}

// ---------------- Orders & bookings ----------------
export async function resendOrderEmail(orderId: number) {
  await guard();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const path = order?.kind === "booking" ? "/admin/bookings" : "/admin/orders";
  if (!order || order.status !== "paid") fail(path, "Only paid orders can be re-sent.");
  const result = await sendOrderEmails(orderId, { includeAdmin: false });
  if (result.status === "sent") done(path, `Email re-sent to ${order!.customerEmail}.`);
  fail(path, `Email not sent: ${result.error ?? "unknown error"}`);
}

export async function updateBookingStatus(id: number, status: string) {
  await guard();
  if (!["pending_payment", "confirmed", "completed", "cancelled"].includes(status)) fail("/admin/bookings", "Invalid status.");
  await db.update(bookings).set({ status }).where(eq(bookings.id, id));
  done("/admin/bookings", "Booking updated.");
}

// ---------------- Studio services & hours ----------------
export async function saveService(formData: FormData) {
  await guard();
  const id = int(formData, "id", 0);
  const name = str(formData, "name");
  if (!name) fail("/admin/studio", "Service name is required.");
  const values = {
    name,
    slug: slugify(name) || `service-${Date.now()}`,
    description: str(formData, "description"),
    pricePerHour: dec(formData, "pricePerHour"),
    minHours: Math.max(1, int(formData, "minHours", 1)),
    maxHours: Math.max(1, int(formData, "maxHours", 8)),
    depositPercent: Math.min(100, Math.max(1, int(formData, "depositPercent", 50))),
    isActive: formData.get("isActive") === "on",
    sortOrder: int(formData, "sortOrder", 0),
  };
  if (values.maxHours < values.minHours) values.maxHours = values.minHours;
  if (id) {
    const { slug: _slug, ...rest } = values;
    void _slug;
    await db.update(services).set(rest).where(eq(services.id, id));
  } else {
    const clash = await db.select({ id: services.id }).from(services).where(eq(services.slug, values.slug)).limit(1);
    await db.insert(services).values(clash.length ? { ...values, slug: `${values.slug}-${Date.now().toString(36)}` } : values);
  }
  revalidatePath("/studio");
  done("/admin/studio", id ? "Service updated." : "Service added.");
}

export async function deleteService(id: number) {
  await guard();
  await db.delete(services).where(eq(services.id, id));
  revalidatePath("/studio");
  done("/admin/studio", "Service removed.");
}

export async function saveHours(formData: FormData) {
  await guard();
  for (let dow = 0; dow < 7; dow++) {
    const opensAt = str(formData, `opens_${dow}`, "09:00") || "09:00";
    const closesAt = str(formData, `closes_${dow}`, "21:00") || "21:00";
    const isOpen = formData.get(`open_${dow}`) === "on";
    await db
      .insert(studioHours)
      .values({ dayOfWeek: dow, opensAt, closesAt, isOpen })
      .onConflictDoUpdate({ target: studioHours.dayOfWeek, set: { opensAt, closesAt, isOpen } });
  }
  revalidatePath("/studio");
  done("/admin/studio", "Opening hours saved.");
}

// ---------------- License types ----------------
export async function saveLicenseType(formData: FormData) {
  await guard();
  const id = int(formData, "id", 0);
  const name = str(formData, "name");
  if (!name) fail("/admin/licenses", "License name is required.");
  const deliverables = ["mp3", "wav", "stems"].filter((d) => formData.get(`d_${d}`) === "on");
  const values = {
    name,
    tagline: str(formData, "tagline"),
    description: str(formData, "description"),
    terms: str(formData, "terms"),
    deliverables: (deliverables.length ? deliverables : ["mp3"]).join(","),
    isExclusive: formData.get("isExclusive") === "on",
    defaultPrice: dec(formData, "defaultPrice"),
    sortOrder: int(formData, "sortOrder", 0),
    isActive: formData.get("isActive") === "on",
  };
  if (id) {
    await db.update(licenseTypes).set(values).where(eq(licenseTypes.id, id));
  } else {
    const base = slugify(name) || "license";
    const clash = await db.select({ id: licenseTypes.id }).from(licenseTypes).where(eq(licenseTypes.slug, base)).limit(1);
    await db.insert(licenseTypes).values({ ...values, slug: clash.length ? `${base}-${Date.now().toString(36)}` : base });
  }
  revalidatePath("/beats");
  done("/admin/licenses", id ? "License updated." : "License added.");
}

// ---------------- Settings ----------------
export async function saveSettingsAction(formData: FormData) {
  await guard();
  const feePercent = parseFloat(str(formData, "feePercent", "10"));
  const accentColor = hexColor(formData, "accentColor", "#c6f135");
  const subaccount = str(formData, "paystackSubaccount").trim();
  const promoCode = str(formData, "promoCode").toUpperCase();
  const promoExpiresAt = promoExpiry(formData);
  if (promoCode && !isValidPromoCode(promoCode)) {
    fail("/admin/settings", "Promo code must be at least 10 characters and contain both letters and numbers only.");
  }
  // Only validate subaccount codes (ACCT_xxx) against Paystack. Split codes
  // (SPL_xxx) are pre-configured in the Paystack dashboard and don't need
  // validation here — they'll be verified when the first transaction runs.
  if (subaccount && isPaystackConfigured() && !isValidSplitCode(subaccount)) {
    const check = await subaccountIsUsable(subaccount);
    if (!check.ok) {
      done("/admin/settings", `Subaccount rejected by Paystack: ${check.error} Check that the code belongs to the same (test/live) account as your secret key.`);
    }
  }
  await saveSettings({
    siteName: str(formData, "siteName") || "Meetbeatz",
    tagline: str(formData, "tagline"),
    accentColor,
    currency: (str(formData, "currency") || "GHS").toUpperCase().slice(0, 3),
    feePercent: (Number.isFinite(feePercent) ? Math.min(50, Math.max(0, feePercent)) : 10).toString(),
    promoCode,
    promoPercent: "5",
    promoExpiresAt,
    paystackSubaccount: subaccount,
    feeBearer: str(formData, "feeBearer") === "subaccount" ? "subaccount" : "account",
    contactEmail: str(formData, "contactEmail"),
    contactPhone: str(formData, "contactPhone"),
    whatsapp: str(formData, "whatsapp"),
    location: str(formData, "location"),
    instagram: str(formData, "instagram"),
    notifyEmail: str(formData, "notifyEmail"),
    whatsappAlerts: str(formData, "whatsappAlerts"),
    bookingPolicy: str(formData, "bookingPolicy"),
    screenGuard: normalizeScreenGuardMode(str(formData, "screenGuard", "block")),
    ...(formData.has("liveRecordingOpen")
      ? { liveRecordingOpen: str(formData, "liveRecordingOpen") === "1" ? "1" : "0" }
      : {}),
  });
  revalidatePath("/", "layout");
  done("/admin/settings", "Settings saved.");
}

export async function toggleLiveRecordingAction(formData: FormData) {
  await guard();
  const next = str(formData, "liveRecordingOpen") === "1" ? "1" : "0";
  const returnTo = str(formData, "returnTo") || "/admin/live-recording";
  await saveSettings({ liveRecordingOpen: next });
  revalidatePath("/", "layout");
  done(
    returnTo,
    next === "1"
      ? "Live Recording is now OPEN to artists."
      : "Live Recording is now set to Coming Soon (producer access only).",
  );
}

export async function createPromoCodeAction(formData: FormData) {
  await guard();
  const code = str(formData, "promoCode").toUpperCase();
  if (!isValidPromoCode(code)) {
    fail("/admin/settings", "Promo code must be at least 10 characters and contain both letters and numbers only.");
  }
  const expiry = promoExpiry(formData);
  const [created] = await db
    .insert(promoCodes)
    .values({ code, expiresAt: expiry ? new Date(expiry) : null, isActive: true })
    .onConflictDoNothing({ target: promoCodes.code })
    .returning({ id: promoCodes.id });
  if (!created) fail("/admin/settings", "That promo code already exists. Choose another code.");
  done("/admin/settings", `Promo code ${code} created.`);
}

export async function generatePromoCodeAction(formData: FormData) {
  await guard();
  const expiry = promoExpiry(formData);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatedPromoCode();
    const [created] = await db
      .insert(promoCodes)
      .values({ code, expiresAt: expiry ? new Date(expiry) : null, isActive: true })
      .onConflictDoNothing({ target: promoCodes.code })
      .returning({ id: promoCodes.id });
    if (created) done("/admin/settings", `Generated promo code ${code}.`);
  }
  fail("/admin/settings", "Could not generate a unique promo code. Please try again.");
}

export async function togglePromoCodeAction(formData: FormData) {
  await guard();
  const id = Number(formData.get("promoCodeId"));
  if (!Number.isSafeInteger(id) || id <= 0) fail("/admin/settings", "Invalid promo code.");
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
  if (!promo) fail("/admin/settings", "Promo code not found.");
  await db.update(promoCodes).set({ isActive: !promo.isActive }).where(eq(promoCodes.id, id));
  done("/admin/settings", `${promo.code} is now ${promo.isActive ? "disabled" : "active"}.`);
}

export async function changePasswordAction(formData: FormData) {
  const session = await guard();
  const current = str(formData, "currentPassword");
  const next = str(formData, "newPassword");
  const confirm = str(formData, "confirmPassword");
  const [admin] = await db.select().from(admins).where(eq(admins.id, session.id)).limit(1);
  if (!admin || !verifyPassword(current, admin.passwordHash)) fail("/admin/settings", "Current password is incorrect.");
  if (next.length < 8) fail("/admin/settings", "New password must be at least 8 characters.");
  if (next !== confirm) fail("/admin/settings", "New passwords do not match.");
  await changeAdminPassword(session.id, next);
  done("/admin/settings", "Password changed.");
}

export async function sendTestEmailAction(formData: FormData) {
  const session = await guard();
  const to = str(formData, "to") || session.email;
  const [settings, baseUrl] = await Promise.all([getSettings(), getBaseUrl()]);
  const result = await sendEmail({
    to,
    subject: `${settings.siteName} test email`,
    html: emailLayout({
      title: "Test email",
      body: `<h1 style="margin:0 0 8px 0;font-size:22px;color:#f4f1ea">Email is working 🎉</h1><p style="color:#c8c8d0;font-size:14px">Customers will receive their beats, licenses and booking confirmations from this address.</p>`,
      settings,
      baseUrl,
    }),
  });
  if (result.status === "sent") done("/admin/settings", `Test email sent to ${to}.`);
  fail("/admin/settings", `Test email failed: ${result.error ?? "unknown error"}`);
}

export async function sendTestWhatsAppAction(formData: FormData) {
  await guard();
  const settings = await getSettings();
  // Prefer the value in the submitted form so the producer can test a newly
  // entered number before saving the rest of the settings form.
  const to = str(formData, "whatsappAlerts") || settings.whatsappAlerts;
  if (!to) fail("/admin/settings", "Enter your WhatsApp alert number first.");

  const result = await sendWhatsAppAlert(
    to,
    `Meetbeatz test alert ✅\nThis is where new studio booking requests and payment confirmations will arrive.`,
  );
  if (result.status === "sent") done("/admin/settings", `WhatsApp test sent to ${to}.`);
  fail("/admin/settings", `WhatsApp test failed: ${result.detail}`);
}

// ---------------- Ads.txt ----------------
/**
 * Save ads.txt contents in PostgreSQL. The dynamic /ads.txt route reads the
 * same value, so updates work on both regular Node servers and serverless
 * hosts where public/ is read-only.
 *
 * Validate on the server as well as in the editor so a non-JavaScript submit
 * cannot bypass the checks.
 */
export async function saveAdsTxtAction(formData: FormData) {
  await guard();
  const contents = str(formData, "contents");
  const issues = validateAdsTxt(contents);
  if (issues.length > 0) {
    fail(
      "/admin/settings",
      `ads.txt not saved — ${issues[0].message}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ""}`,
    );
  }
  await saveAdsTxt(contents);
  revalidatePath("/ads.txt");
  done("/admin/settings", "ads.txt saved and live at /ads.txt.");
}

// ---------------- Music distribution ----------------
/**
 * Moves a release through the review states and records the note the artist
 * sees on their account page and in the status email.
 */
export async function updateReleaseStatus(formData: FormData) {
  await guard();
  const id = int(formData, "id", 0);
  const status = str(formData, "status");
  if (!(RELEASE_STATUSES as readonly string[]).includes(status)) {
    fail("/admin/distribution", "That is not a release status.");
  }
  const producerNote = str(formData, "producerNote");
  // "Changes requested" and "not accepted" without an explanation leave the
  // artist with nowhere to go, so the note is required for those two.
  if ((status === "changes_requested" || status === "rejected") && producerNote.length < 5) {
    fail("/admin/distribution", "Add a note telling the artist what to change — they only see what you write here.");
  }
  await setReleaseStatus(id, status, producerNote);
  revalidatePath("/account");
  done("/admin/distribution", "Release updated.");
}

/** Edits a distribution tier. Prices only affect future submissions. */
export async function saveDistributionPlan(formData: FormData) {
  await guard();
  const id = int(formData, "id", 0);
  if (!id) fail("/admin/distribution", "Unknown tier.");
  const name = str(formData, "name");
  if (!name) fail("/admin/distribution", "A tier needs a name.");
  await updatePlan(id, {
    name,
    tagline: str(formData, "tagline"),
    tracks: Math.max(1, Math.min(100, int(formData, "tracks", 1))),
    price: dec(formData, "price"),
    turnaroundDays: Math.max(1, Math.min(120, int(formData, "turnaroundDays", 7))),
    royaltyPercent: Math.max(0, Math.min(100, int(formData, "royaltyPercent", 0))),
    isActive: formData.get("isActive") === "on",
    sortOrder: int(formData, "sortOrder", 0),
  });
  revalidatePath("/distribution");
  done("/admin/distribution", "Tier saved. Releases already submitted keep the price they paid.");
}

// ---------------- Online recording ----------------
/** Confirms, completes or cancels a remote session request. */
export async function updateRemoteSessionStatus(formData: FormData) {
  await guard();
  const id = int(formData, "id", 0);
  const status = str(formData, "status");
  if (!(SESSION_STATUSES as readonly string[]).includes(status)) {
    fail("/admin/recording", "That is not a session status.");
  }
  const producerNote = str(formData, "producerNote");
  if (status === "cancelled" && producerNote.length < 5) {
    fail("/admin/recording", "Tell the artist why the session was cancelled.");
  }
  await setRemoteSessionStatus(id, status, producerNote);
  revalidatePath("/account");
  done("/admin/recording", "Session updated.");
}
