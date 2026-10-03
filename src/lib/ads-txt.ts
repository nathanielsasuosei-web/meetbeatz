import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * ads.txt (Authorized Digital Sellers) tells ad buyers which companies are
 * allowed to sell inventory for this site. We keep the text in PostgreSQL and
 * serve it from the dynamic `/ads.txt` route. This works on both writable
 * servers and serverless hosts such as Vercel, where `public/` is read-only at
 * runtime.
 *
 * The pure validator lives in `./ads-txt-format` so it can be imported from
 * client components without dragging in database or Node-only code.
 */
export { validateAdsTxt, type AdsTxtIssue } from "./ads-txt-format";

const SETTINGS_KEY = "adsTxt";

/** Safe initial response until the publisher pastes Google's exact record. */
export const DEFAULT_ADS_TXT = `# ads.txt — Google AdSense seller authorization
# https://adsense.google.com/start/resources/ads-txt
#
# Current publisher and the additional seller record supplied for Meetbeatz.
# Manage this file in Admin → Settings → Ads & ads.txt.

google.com, pub-6344164153032042, DIRECT, f08c47fec0942fa0
google.com, pub-2621708947375319, DIRECT, f08c47fec0942fa0
`;

export async function getAdsTxt(): Promise<string> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .limit(1);
  return row?.value ?? DEFAULT_ADS_TXT;
}

/** Save ads.txt in the database; `/ads.txt` reads this value on each request. */
export async function saveAdsTxt(contents: string): Promise<void> {
  const normalized = contents.replace(/\r\n?/g, "\n").trim();
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: normalized, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: normalized, updatedAt: new Date() },
    });
}
