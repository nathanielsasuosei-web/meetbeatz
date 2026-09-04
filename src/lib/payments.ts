import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  admins,
  beatLicenses,
  beats,
  bookings,
  licenseTypes,
  licenses,
  orderItems,
  orders,
  services,
  type Booking,
  type License,
  type Order,
  type OrderItem,
} from "@/db/schema";
import { sendEmail } from "./email";
import { adminNewOrderHtml, bookingEmailHtml, purchaseEmailHtml } from "./email-templates";
import { minutesToTime, num, round2, timeToMinutes, toMinor } from "./format";
import { makeLicenseKey, makeReference, randomToken } from "./ids";
import { initializeTransaction, verifyTransaction, type VerifyResult } from "./paystack";
import { getPaymentMode, getSettings, type SiteSettings } from "./settings";
import { isSlotAvailable, isValidDateString, todayString } from "./slots";
import { getBaseUrl } from "./url";

export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type CustomerInput = {
  name: string;
  email: string;
  phone: string;
  network: string;
};

export function computeTotals(subtotal: number, feePercent: number) {
  const sub = round2(subtotal);
  const fee = round2((sub * feePercent) / 100);
  return { subtotal: sub, fee, total: round2(sub + fee) };
}

function cleanCustomer(raw: Partial<CustomerInput>): CustomerInput {
  const name = (raw.name ?? "").trim();
  const email = (raw.email ?? "").trim().toLowerCase();
  const phone = (raw.phone ?? "").trim();
  const network = (raw.network ?? "mtn").trim();
  if (name.length < 2) throw new CheckoutError("Please enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckoutError("Please enter a valid email address — your files are delivered there.");
  if (!["mtn", "vodafone", "airteltigo", "card"].includes(network)) throw new CheckoutError("Please choose a payment network.");
  if (network !== "card" && phone.replace(/\D/g, "").length < 9) throw new CheckoutError("Please enter the mobile money number you will pay with.");
  return { name, email, phone, network };
}

async function startPayment(order: Order, settings: SiteSettings, baseUrl: string, metadata: Record<string, unknown>) {
  const mode = getPaymentMode();
  if (mode === "simulation") {
    return `${baseUrl}/checkout/simulate/${order.reference}`;
  }
  const subaccount = settings.paystackSubaccount.trim() || null;
  const result = await initializeTransaction({
    email: order.customerEmail,
    amountMinor: toMinor(num(order.total)),
    currency: order.currency,
    reference: order.reference,
    callbackUrl: `${baseUrl}/checkout/verify`,
    metadata: {
      ...metadata,
      order_reference: order.reference,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      custom_fields: [
        { display_name: "Customer", variable_name: "customer_name", value: order.customerName },
        { display_name: "Order", variable_name: "order_reference", value: order.reference },
      ],
    },
    subaccount,
    transactionChargeMinor: subaccount ? toMinor(num(order.fee)) : null,
    bearer: settings.feeBearer === "subaccount" ? "subaccount" : "account",
    channels: order.network === "card" ? ["card"] : ["mobile_money", "card"],
  });
  await db
    .update(orders)
    .set({ providerData: { access_code: result.access_code, authorization_url: result.authorization_url } })
    .where(eq(orders.id, order.id));
  return result.authorization_url;
}

// ---------------------------------------------------------------------------
// Beat purchase
// ---------------------------------------------------------------------------
export async function createBeatOrder(input: {
  beatSlug: string;
  licenseTypeId: number;
  customer: Partial<CustomerInput>;
}): Promise<{ url: string; reference: string }> {
  const customer = cleanCustomer(input.customer);
  const [beat] = await db
    .select()
    .from(beats)
    .where(and(eq(beats.slug, input.beatSlug), eq(beats.isPublished, true)))
    .limit(1);
  if (!beat) throw new CheckoutError("This beat is no longer available.", 404);
  if (!beat.mp3Path && !beat.wavPath) throw new CheckoutError("This beat has no downloadable files yet.");

  const [row] = await db
    .select({ bl: beatLicenses, lt: licenseTypes })
    .from(beatLicenses)
    .innerJoin(licenseTypes, eq(beatLicenses.licenseTypeId, licenseTypes.id))
    .where(
      and(
        eq(beatLicenses.beatId, beat.id),
        eq(beatLicenses.licenseTypeId, input.licenseTypeId),
        eq(beatLicenses.isEnabled, true),
        eq(licenseTypes.isActive, true),
      ),
    )
    .limit(1);
  if (!row) throw new CheckoutError("That license is not available for this beat.");
  if (row.lt.isExclusive && beat.exclusiveSold) throw new CheckoutError("Exclusive rights for this beat have already been sold.");

  const settings = await getSettings();
  const totals = computeTotals(num(row.bl.price), num(settings.feePercent));
  const reference = makeReference("MB");

  const [order] = await db
    .insert(orders)
    .values({
      reference,
      kind: "beat",
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      network: customer.network,
      subtotal: totals.subtotal.toFixed(2),
      feePercent: num(settings.feePercent).toFixed(2),
      fee: totals.fee.toFixed(2),
      total: totals.total.toFixed(2),
      currency: settings.currency,
      status: "pending",
      paymentProvider: getPaymentMode(),
      splitSubaccount: settings.paystackSubaccount.trim() || null,
    })
    .returning();

  await db.insert(orderItems).values({
    orderId: order.id,
    beatId: beat.id,
    licenseTypeId: row.lt.id,
    beatTitle: beat.title,
    licenseName: row.lt.name,
    price: totals.subtotal.toFixed(2),
  });

  const baseUrl = await getBaseUrl();
  const url = await startPayment(order, settings, baseUrl, {
    kind: "beat",
    beat: beat.title,
    license: row.lt.name,
  });
  return { url, reference };
}

// ---------------------------------------------------------------------------
// Studio booking
// ---------------------------------------------------------------------------
export async function createBookingOrder(input: {
  serviceId: number;
  date: string;
  startTime: string;
  hours: number;
  notes: string;
  customer: Partial<CustomerInput>;
}): Promise<{ url: string; reference: string }> {
  const customer = cleanCustomer(input.customer);
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, input.serviceId), eq(services.isActive, true)))
    .limit(1);
  if (!service) throw new CheckoutError("Please choose a studio service.", 404);

  const hours = Math.floor(num(input.hours));
  if (hours < service.minHours || hours > service.maxHours) {
    throw new CheckoutError(`${service.name} sessions are between ${service.minHours} and ${service.maxHours} hours.`);
  }
  if (!isValidDateString(input.date) || input.date < todayString()) throw new CheckoutError("Please pick a valid upcoming date.");
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) throw new CheckoutError("Please choose a start time.");
  if (!(await isSlotAvailable(input.date, input.startTime, hours))) {
    throw new CheckoutError("That time slot was just taken. Please choose another slot.", 409);
  }

  const settings = await getSettings();
  const sessionPrice = round2(num(service.pricePerHour) * hours);
  const deposit = round2((sessionPrice * service.depositPercent) / 100);
  const totals = computeTotals(deposit, num(settings.feePercent));
  const reference = makeReference("MBS");
  const endTime = minutesToTime(timeToMinutes(input.startTime) + hours * 60);

  const [order] = await db
    .insert(orders)
    .values({
      reference,
      kind: "booking",
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      network: customer.network,
      subtotal: totals.subtotal.toFixed(2),
      feePercent: num(settings.feePercent).toFixed(2),
      fee: totals.fee.toFixed(2),
      total: totals.total.toFixed(2),
      currency: settings.currency,
      status: "pending",
      paymentProvider: getPaymentMode(),
      splitSubaccount: settings.paystackSubaccount.trim() || null,
    })
    .returning();

  await db.insert(bookings).values({
    orderId: order.id,
    serviceId: service.id,
    serviceName: service.name,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    bookingDate: input.date,
    startTime: input.startTime,
    endTime,
    hours,
    notes: (input.notes ?? "").trim().slice(0, 1000),
    sessionPrice: sessionPrice.toFixed(2),
    amountPaid: "0.00",
    status: "pending_payment",
  });

  const baseUrl = await getBaseUrl();
  const url = await startPayment(order, settings, baseUrl, {
    kind: "booking",
    service: service.name,
    date: input.date,
    start_time: input.startTime,
    hours,
  });
  return { url, reference };
}

// ---------------------------------------------------------------------------
// Loading & finalizing
// ---------------------------------------------------------------------------
export type OrderBundle = {
  order: Order;
  items: OrderItem[];
  licenses: License[];
  booking: Booking | null;
};

export async function loadOrderByReference(reference: string): Promise<OrderBundle | null> {
  const [order] = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);
  if (!order) return null;
  return loadBundle(order);
}

export async function loadOrderById(id: number): Promise<OrderBundle | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  return loadBundle(order);
}

async function loadBundle(order: Order): Promise<OrderBundle> {
  const [items, lics, [booking]] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id)),
    db.select().from(licenses).where(eq(licenses.orderId, order.id)).orderBy(asc(licenses.id)),
    db.select().from(bookings).where(eq(bookings.orderId, order.id)).limit(1),
  ]);
  return { order, items, licenses: lics, booking: booking ?? null };
}

export async function finalizeOrder(
  reference: string,
  opts: { provider: "paystack" | "simulation"; providerData?: unknown },
): Promise<Order> {
  const [order] = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);
  if (!order) throw new CheckoutError("Order not found.", 404);
  if (order.status === "paid") return order;

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        status: "paid",
        paidAt: now,
        paymentProvider: opts.provider,
        providerData: (opts.providerData ?? order.providerData) as Record<string, unknown> | null,
      })
      .where(eq(orders.id, order.id));

    if (order.kind === "beat") {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        const existing = await tx.select({ id: licenses.id }).from(licenses).where(eq(licenses.orderItemId, item.id)).limit(1);
        if (existing.length) continue;
        const [lt] = item.licenseTypeId
          ? await tx.select().from(licenseTypes).where(eq(licenseTypes.id, item.licenseTypeId)).limit(1)
          : [];
        await tx.insert(licenses).values({
          licenseKey: makeLicenseKey(),
          orderId: order.id,
          orderItemId: item.id,
          beatId: item.beatId,
          licenseTypeId: item.licenseTypeId,
          beatTitle: item.beatTitle,
          licenseName: item.licenseName,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          price: item.price,
          currency: order.currency,
          terms: lt?.terms ?? "",
          deliverables: lt?.deliverables ?? "mp3",
          isExclusive: lt?.isExclusive ?? false,
          downloadToken: randomToken(),
        });
        if (lt?.isExclusive && item.beatId) {
          await tx
            .update(beats)
            .set({ exclusiveSold: true, isPublished: false, updatedAt: now })
            .where(eq(beats.id, item.beatId));
        }
      }
    } else {
      await tx
        .update(bookings)
        .set({ status: "confirmed", amountPaid: order.subtotal })
        .where(and(eq(bookings.orderId, order.id), eq(bookings.status, "pending_payment")));
    }
  });

  try {
    await sendOrderEmails(order.id, { includeAdmin: true });
  } catch (err) {
    console.error("[payments] failed to send order emails", err);
  }

  const [updated] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return updated;
}

export async function markOrderFailed(reference: string, providerData?: unknown) {
  await db
    .update(orders)
    .set({ status: "failed", providerData: (providerData ?? null) as Record<string, unknown> | null })
    .where(and(eq(orders.reference, reference), eq(orders.status, "pending")));
}

export async function sendOrderEmails(orderId: number, opts: { includeAdmin?: boolean } = {}) {
  const bundle = await loadOrderById(orderId);
  if (!bundle) throw new Error("Order not found");
  const { order, items, booking } = bundle;
  const [settings, baseUrl] = await Promise.all([getSettings(), getBaseUrl()]);

  let subject: string;
  let html: string;
  if (order.kind === "beat") {
    subject = `Your ${settings.siteName} beats & license — ${order.reference}`;
    html = purchaseEmailHtml({ order, licenses: bundle.licenses, baseUrl, settings });
  } else {
    if (!booking) throw new Error("Booking missing for order");
    subject = `Studio session confirmed — ${booking.serviceName} on ${booking.bookingDate}`;
    html = bookingEmailHtml({ order, booking, baseUrl, settings });
  }

  const result = await sendEmail({ to: order.customerEmail, subject, html, orderId: order.id });
  if (result.status === "sent") {
    await db.update(orders).set({ emailSentAt: new Date() }).where(eq(orders.id, order.id));
  }

  if (opts.includeAdmin) {
    let notify = settings.notifyEmail.trim();
    if (!notify) {
      const [admin] = await db.select({ email: admins.email }).from(admins).limit(1);
      notify = admin?.email ?? "";
    }
    if (notify) {
      await sendEmail({
        to: notify,
        subject: `New ${order.kind === "beat" ? "beat sale" : "studio booking"} — ${order.reference}`,
        html: adminNewOrderHtml({ order, items, booking, baseUrl, settings }),
        orderId: order.id,
      });
    }
  }
  return result;
}

export async function verifyPaystackAndFinalize(
  reference: string,
): Promise<{ order: Order | null; verified: VerifyResult | null; error?: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.reference, reference)).limit(1);
  if (!order) return { order: null, verified: null, error: "Order not found" };
  if (order.status === "paid") return { order, verified: null };

  let verified: VerifyResult;
  try {
    verified = await verifyTransaction(reference);
  } catch (err) {
    return { order, verified: null, error: err instanceof Error ? err.message : "Verification failed" };
  }

  const providerData = {
    id: verified.id,
    status: verified.status,
    channel: verified.channel,
    amount: verified.amount,
    currency: verified.currency,
    paid_at: verified.paid_at,
    gateway_response: verified.gateway_response,
    fees: verified.fees,
    fees_split: verified.fees_split ?? null,
    authorization: verified.authorization ?? null,
  };

  if (verified.status === "success") {
    if (verified.amount < toMinor(num(order.total))) {
      await markOrderFailed(reference, { ...providerData, note: "Amount paid is less than order total" });
      const [failed] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return { order: failed, verified, error: "Amount paid does not match the order total." };
    }
    const updated = await finalizeOrder(reference, { provider: "paystack", providerData });
    return { order: updated, verified };
  }

  if (verified.status === "failed" || verified.status === "abandoned" || verified.status === "reversed") {
    await markOrderFailed(reference, providerData);
  }
  const [current] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return { order: current, verified };
}
