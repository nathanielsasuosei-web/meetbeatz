"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { beats, bookings, licenseTypes, orders, services, studioHours } from "@/db/schema";
import { changeAdminPassword, destroyAdminSession, getAdminSession, verifyPassword } from "@/lib/auth";
import { admins } from "@/db/schema";
import { deleteUpload } from "@/lib/files";
import { slugify } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import { emailLayout } from "@/lib/email-templates";
import { sendOrderEmails } from "@/lib/payments";
import { getSettings, saveSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/url";

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
    for (const p of [beat.coverPath, beat.previewPath, beat.mp3Path, beat.wavPath, beat.stemsPath]) {
      if (p && !p.startsWith("/") && !p.startsWith("previews/demo-")) await deleteUpload(p);
    }
  }
  done("/admin/beats", "Beat deleted.");
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
  await saveSettings({
    siteName: str(formData, "siteName") || "Meetbeatz",
    tagline: str(formData, "tagline"),
    currency: (str(formData, "currency") || "GHS").toUpperCase().slice(0, 3),
    feePercent: (Number.isFinite(feePercent) ? Math.min(50, Math.max(0, feePercent)) : 10).toString(),
    paystackSubaccount: str(formData, "paystackSubaccount"),
    feeBearer: str(formData, "feeBearer") === "subaccount" ? "subaccount" : "account",
    contactEmail: str(formData, "contactEmail"),
    contactPhone: str(formData, "contactPhone"),
    whatsapp: str(formData, "whatsapp"),
    location: str(formData, "location"),
    instagram: str(formData, "instagram"),
    notifyEmail: str(formData, "notifyEmail"),
    bookingPolicy: str(formData, "bookingPolicy"),
  });
  revalidatePath("/", "layout");
  done("/admin/settings", "Settings saved.");
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
