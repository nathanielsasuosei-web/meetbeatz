import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
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
  type Beat,
  type BeatLicense,
  type Booking,
  type License,
  type LicenseType,
  type Order,
  type OrderItem,
} from "@/db/schema";
import { sendEmail } from "./email";
import { EMAIL_ERROR, isValidEmail, normalizeEmailAddress } from "./email-address";
import { adminNewOrderHtml, bookingEmailHtml, purchaseEmailHtml } from "./email-templates";
import { minutesToTime, num, round2, timeToMinutes, toMinor } from "./format";
import { makeLicenseKey, makeReference, randomToken } from "./ids";
import { initializeTransaction, isValidSplitCode, isValidSubaccountCode, verifyTransaction, type VerifyResult } from "./paystack";
import { resolvePromoCode } from "./promos";
import { getPaymentMode, getSettings, type SiteSettings } from "./settings";
import { isSlotAvailable, isValidDateString, todayString } from "./slots";
import { notifyBooking } from "./notifications";
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

export function computePromoTotals(subtotal: number, feePercent: number, promoPercent: number) {
  const originalSubtotal = round2(subtotal);
  const discount = round2((originalSubtotal * promoPercent) / 100);
  const discountedSubtotal = round2(originalSubtotal - discount);
  const fee = round2((discountedSubtotal * feePercent) / 100);
  return {
    subtotal: originalSubtotal,
    discount,
    fee,
    total: round2(discountedSubtotal + fee),
  };
}

function cleanCustomer(raw: Partial<CustomerInput>): CustomerInput {
  const name = (raw.name ?? "").trim();
  const email = normalizeEmailAddress(raw.email);
  const phone = (raw.phone ?? "").trim();
  const network = (raw.network ?? "mtn").trim();
  if (name.length < 2) throw new CheckoutError("Please enter your full name.");
  // The address the files, license certificate and receipt are sent to, so it
  // is validated here as well as in the browser — a bad address would mean a
  // paid order nobody can receive.
  if (!isValidEmail(email)) throw new CheckoutError(`${EMAIL_ERROR} Your files are delivered there.`);
  if (!["mtn", "vodafone", "airteltigo", "card"].includes(network)) throw new CheckoutError("Please choose a payment network.");
  if (network !== "card" && phone.replace(/\D/g, "").length < 9) throw new CheckoutError("Please enter the mobile money number you will pay with.");
  return { name, email, phone, network };
}

async function startPayment(order: Order, settings: SiteSettings, baseUrl: string, metadata: Record<string, unknown>) {
  const mode = getPaymentMode();
  if (mode === "simulation") {
    return `${baseUrl}/checkout/simulate/${order.reference}`;
  }
  const rawSplitValue = settings.paystackSubaccount.trim() || null;

  // The settings.paystackSubaccount field may hold either:
  //   • a Paystack Split code   (SPL_xxx) — preferred, pre-defined split plan
  //   • a subaccount code       (ACCT_xxx) — legacy subaccount-based split
  // Detect which one it is. If it's neither, skip the split entirely so the
  // customer can still pay (money lands in the main account).
  let splitCode: string | null = null;
  let subaccount: string | null = null;

  if (rawSplitValue) {
    if (isValidSplitCode(rawSplitValue)) {
      splitCode = rawSplitValue;
    } else if (isValidSubaccountCode(rawSplitValue)) {
      subaccount = rawSplitValue;
    } else {
      console.error(`[payments] Ignoring unrecognised Paystack split/subaccount code "${rawSplitValue}" — expected SPL_xxx or ACCT_xxx.`);
    }
  }

  // For legacy subaccount splits, we need a positive transaction charge (the
  // platform fee). If the fee is 0, skip the split — Paystack rejects
  // transaction_charge = 0 with "Invalid split transaction values".
  const transactionChargeMinor = toMinor(num(order.fee));
  if (subaccount && transactionChargeMinor <= 0) {
    console.warn(`[payments] Skipping subaccount split: fee is ${order.fee} (minor: ${transactionChargeMinor}). Money will go to main account.`);
    subaccount = null;
  }

  const build = () => ({
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
    splitCode,
    subaccount,
    transactionChargeMinor: subaccount ? transactionChargeMinor : null,
    bearer: (settings.feeBearer === "subaccount" ? "subaccount" : "account") as "account" | "subaccount",
    channels: order.network === "card" ? ["card"] : ["mobile_money", "card"],
  });

  let result;
  try {
    result = await initializeTransaction(build());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Paystack returns "Invalid Subaccount" when the code does not belong to
    // the account behind PAYSTACK_SECRET_KEY (a very common test-vs-live key
    // mismatch). It returns "Invalid split transaction values" when the split
    // configuration is wrong. In either case, retry without the split so the
    // customer can still pay.
    const hasSplit = splitCode || subaccount;
    if (hasSplit && (/subaccount/i.test(message) || /split/i.test(message))) {
      console.error(`[payments] Paystack rejected split (${message}). Retrying without split.`);
      splitCode = null;
      subaccount = null;
      result = await initializeTransaction(build());
      await db.update(orders).set({ splitSubaccount: null }).where(eq(orders.id, order.id));
    } else {
      throw err;
    }
  }

  await db
    .update(orders)
    .set({ providerData: { access_code: result.access_code, authorization_url: result.authorization_url } })
    .where(eq(orders.id, order.id));
  return result.authorization_url;
}

// ---------------------------------------------------------------------------
// Beat purchase
// ---------------------------------------------------------------------------
export type BeatCartItemInput = {
  beatSlug: string;
  licenseTypeId: number;
};

export async function createBeatOrder(input: {
  beatSlug: string;
  licenseTypeId: number;
  customer: Partial<CustomerInput>;
  /** Signed-in artist — puts the order straight onto their account. */
  customerId?: number | null;
  paymentMethod?: "ghana" | "global";
  promoCode?: string;
  agreedToTerms?: boolean;
}): Promise<{ url: string; reference: string }> {
  return createBeatCartOrder({
    items: [{ beatSlug: input.beatSlug, licenseTypeId: input.licenseTypeId }],
    customer: input.customer,
    customerId: input.customerId,
    paymentMethod: input.paymentMethod,
    promoCode: input.promoCode,
    agreedToTerms: input.agreedToTerms,
  });
}

/**
 * Creates one pending order for every beat/license in the cart. Prices and
 * license availability are always re-read here; the browser cart is only a
 * convenience and is never trusted for payment totals.
 */
export async function createBeatCartOrder(input: {
  items: BeatCartItemInput[];
  customer: Partial<CustomerInput>;
  customerId?: number | null;
  paymentMethod?: "ghana" | "global";
  promoCode?: string;
  agreedToTerms?: boolean;
}): Promise<{ url: string; reference: string }> {
  if (input.paymentMethod === "global") {
    throw new CheckoutError("Global Payment Worldwide is not connected yet. Choose Mobile Money Ghana.", 503);
  }
  if (input.agreedToTerms !== true) {
    throw new CheckoutError("Please review and agree to the selected license terms before paying.");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new CheckoutError("Your cart is empty.");
  }
  if (input.items.length > 25) throw new CheckoutError("Your cart has too many items.");

  const customer = cleanCustomer(input.customer);
  const seen = new Set<string>();
  const selected: Array<{ beat: Beat; bl: BeatLicense; lt: LicenseType }> = [];

  for (const item of input.items) {
    const slug = String(item.beatSlug ?? "").trim();
    const licenseTypeId = Number(item.licenseTypeId);
    const key = `${slug}:${licenseTypeId}`;
    if (!slug || !Number.isSafeInteger(licenseTypeId) || licenseTypeId <= 0 || seen.has(key)) {
      throw new CheckoutError("One of the items in your cart is invalid.");
    }
    seen.add(key);

    const [beat] = await db
      .select()
      .from(beats)
      .where(and(eq(beats.slug, slug), eq(beats.isPublished, true)))
      .limit(1);
    if (!beat) throw new CheckoutError("One of the beats in your cart is no longer available.", 404);
    if (!beat.mp3Path && !beat.wavPath) throw new CheckoutError(`${beat.title} has no downloadable files yet.`);

    const [row] = await db
      .select({ bl: beatLicenses, lt: licenseTypes })
      .from(beatLicenses)
      .innerJoin(licenseTypes, eq(beatLicenses.licenseTypeId, licenseTypes.id))
      .where(
        and(
          eq(beatLicenses.beatId, beat.id),
          eq(beatLicenses.licenseTypeId, licenseTypeId),
          eq(beatLicenses.isEnabled, true),
          eq(licenseTypes.isActive, true),
        ),
      )
      .limit(1);
    if (!row) throw new CheckoutError(`The selected license for ${beat.title} is no longer available.`);
    if (row.lt.isExclusive && beat.exclusiveSold) throw new CheckoutError(`Exclusive rights for ${beat.title} have already been sold.`);
    selected.push({ beat, bl: row.bl, lt: row.lt });
  }

  const settings = await getSettings();
  const subtotal = round2(selected.reduce((sum, item) => sum + num(item.bl.price), 0));
  const requestedPromo = String(input.promoCode ?? "").trim().toUpperCase();
  const appliedPromo = requestedPromo ? await resolvePromoCode(requestedPromo, settings) : null;
  if (requestedPromo && !appliedPromo) {
    throw new CheckoutError("That promo code is not valid or has expired.");
  }
  const totals = computePromoTotals(subtotal, num(settings.feePercent), appliedPromo?.percent ?? 0);
  const reference = makeReference("MB");

  const [order] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(orders)
      .values({
        reference,
        kind: "beat",
        customerId: input.customerId ?? null,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        network: customer.network,
        subtotal: totals.subtotal.toFixed(2),
        discount: totals.discount.toFixed(2),
        promoCode: appliedPromo?.code ?? "",
        feePercent: num(settings.feePercent).toFixed(2),
        fee: totals.fee.toFixed(2),
        total: totals.total.toFixed(2),
        currency: settings.currency,
        status: "pending",
        paymentProvider: getPaymentMode(),
        splitSubaccount: settings.paystackSubaccount.trim() || null,
      })
      .returning();

    await tx.insert(orderItems).values(
      selected.map(({ beat, lt, bl }) => ({
        orderId: created.id,
        beatId: beat.id,
        licenseTypeId: lt.id,
        beatTitle: beat.title,
        licenseName: lt.name,
        price: num(bl.price).toFixed(2),
      })),
    );

    return [created];
  });

  const baseUrl = await getBaseUrl();
  let url: string;
  try {
    url = await startPayment(order, settings, baseUrl, {
      kind: "beat",
      beats: selected.map(({ beat, lt }) => ({ beat: beat.title, license: lt.name })),
      payment_method: input.paymentMethod ?? "ghana",
      promo_code: appliedPromo?.code ?? null,
      discount: totals.discount,
    });
  } catch (error) {
    // If the gateway cannot initialize, mark the pending order as failed.
    await markOrderFailed(reference, { initialization_error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
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
  /** Signed-in artist — puts the order straight onto their account. */
  customerId?: number | null;
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
      customerId: input.customerId ?? null,
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

  const [booking] = await db
    .insert(bookings)
    .values({
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
    })
    .returning();

  // Alert the producer (site inbox + WhatsApp) the moment the request lands.
  try {
    await notifyBooking(booking, order, "request");
  } catch (err) {
    console.error("[payments] failed to notify producer of new booking", err);
  }

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
export type OrderLicense = License & { videoAvailable: boolean };

export type OrderBundle = {
  order: Order;
  items: OrderItem[];
  licenses: OrderLicense[];
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
  const beatIds = [...new Set(lics.flatMap((license) => (license.beatId === null ? [] : [license.beatId])))];
  const videoRows = beatIds.length
    ? await db
        .select({ id: beats.id })
        .from(beats)
        .where(and(inArray(beats.id, beatIds), isNotNull(beats.videoPath)))
    : [];
  const videoBeatIds = new Set(videoRows.map((beat) => beat.id));
  return {
    order,
    items,
    licenses: lics.map((license) => ({
      ...license,
      videoAvailable: license.beatId !== null && videoBeatIds.has(license.beatId),
    })),
    booking: booking ?? null,
  };
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

  if (order.kind === "booking") {
    // Second alert for the producer: deposit landed, slot is locked.
    // finalizeOrder is idempotent (paid orders early-return), so this fires once.
    const [booking] = await db.select().from(bookings).where(eq(bookings.orderId, order.id)).limit(1);
    if (booking) {
      try {
        await notifyBooking({ ...booking, amountPaid: order.subtotal }, order, "confirmed");
      } catch (err) {
        console.error("[payments] failed to notify producer of confirmed booking", err);
      }
    }
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
