import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, licenses, orderItems, orders, type Booking, type License, type Order, type OrderItem } from "@/db/schema";
import type { CustomerSession } from "./customer-auth";

/**
 * Everything an artist has bought on the site: beat orders (with their license
 * download links) and studio bookings. Matched both by the account link and by
 * email, so purchases made before the account existed still show up.
 */

export type AccountOrder = {
  order: Order;
  items: OrderItem[];
  licenses: License[];
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

  return {
    orders: orderRows.map((order) => ({
      order,
      items: itemRows.filter((i) => i.orderId === order.id),
      licenses: licenseRows.filter((l) => l.orderId === order.id),
    })),
    bookings: bookingRows,
  };
}
