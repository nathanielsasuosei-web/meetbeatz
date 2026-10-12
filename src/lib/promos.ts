import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, promoRedemptions } from "@/db/schema";

/**
 * Returns true when a code is already reserved by a checkout or belongs to a
 * previously paid/unfinished order created before the redemption table existed.
 * The checkout transaction also protects the unique claim against races.
 */
export async function promoCodeUnavailable(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return false;

  const [claim] = await db
    .select({ id: promoRedemptions.id })
    .from(promoRedemptions)
    .where(eq(promoRedemptions.code, normalized))
    .limit(1);
  if (claim) return true;

  const [legacyOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.promoCode, normalized), inArray(orders.status, ["pending", "paid"])))
    .limit(1);
  return Boolean(legacyOrder);
}
