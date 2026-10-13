import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { beats, bookings, licenses, orderItems, orders, type Booking, type License, type Order, type OrderItem } from "@/db/schema";
import type { CustomerSession } from "./customer-auth";

/**
 * Everything an artist has bought on the site: beat orders (with their license
 * download links) and studio bookings. Matched both by the account link and by
 * email, so purchases made before the account existed still show up.
 */

export type AccountLicense = License & { videoAvailable: boolean };

export type AccountOrder = {
  order: Order;
  items: OrderItem[];
  licenses: AccountLicense[];
};

export type AccountData = {
  orders: AccountOrder[];
  bookings: Booking[];
};

export async function loadAccountData(customer: CustomerSession): Promise<AccountData> {
  const email = customer.email.toLowerCase();
  const orderRows = await db
    .select()
    .from(orders)
    .where(or(eq(orders.customerId, customer.id), sql`lower(${orders.customerEmail}) = ${email}`))
    .orderBy(desc(orders.createdAt), desc(orders.id));

  const orderIds = orderRows.map((o) => o.id);
  const [itemRows, licenseRows, bookingRows] = await Promise.all([
    orderIds.length ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : Promise.resolve([] as OrderItem[]),
    orderIds.length ? db.select().from(licenses).where(inArray(licenses.orderId, orderIds)) : Promise.resolve([] as License[]),
    db
      .select()
      .from(bookings)
      .where(or(sql`lower(${bookings.customerEmail}) = ${email}`, inArray(bookings.orderId, orderIds.length ? orderIds : [-1])))
      .orderBy(desc(bookings.createdAt), desc(bookings.id)),
  ]);
  const licensedBeatIds = [...new Set(licenseRows.flatMap((license) => (license.beatId === null ? [] : [license.beatId])))];
  const videoRows = licensedBeatIds.length
    ? await db
        .select({ id: beats.id })
        .from(beats)
        .where(and(inArray(beats.id, licensedBeatIds), isNotNull(beats.videoPath)))
    : [];
  const videoBeatIds = new Set(videoRows.map((beat) => beat.id));

  return {
    orders: orderRows.map((order) => ({
      order,
      items: itemRows.filter((i) => i.orderId === order.id),
      licenses: licenseRows
        .filter((license) => license.orderId === order.id)
        .map((license) => ({
          ...license,
          videoAvailable: license.beatId !== null && videoBeatIds.has(license.beatId),
        })),
    })),
    bookings: bookingRows,
  };
}
