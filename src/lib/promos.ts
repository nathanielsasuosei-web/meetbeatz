import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { getPromoConfig, type SiteSettings } from "@/lib/settings";

export const PROMO_CODE_PATTERN = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{10,64}$/;

export type PromoConfig = {
  code: string;
  percent: number;
  expiresAt: string | null;
};

export type PromoCodeRecord = {
  id: number;
  code: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export function isValidPromoCode(code: string): boolean {
  return PROMO_CODE_PATTERN.test(code.trim().toUpperCase());
}

export async function listPromoCodes(): Promise<PromoCodeRecord[]> {
  const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt), desc(promoCodes.id));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Resolves an entered code against the producer-managed promo-code table. The
 * older settings-based code remains a backwards-compatible fallback until the
 * producer creates table-managed campaigns.
 */
export async function resolvePromoCode(requestedCode: string, siteSettings: SiteSettings): Promise<PromoConfig | null> {
  const code = requestedCode.trim().toUpperCase();
  if (!isValidPromoCode(code)) return null;

  const [managed] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
  if (managed) {
    if (!managed.isActive || (managed.expiresAt && managed.expiresAt.getTime() <= Date.now())) return null;
    return { code: managed.code, percent: 5, expiresAt: managed.expiresAt?.toISOString() ?? null };
  }

  const legacy = getPromoConfig(siteSettings);
  return legacy?.code === code ? legacy : null;
}
