import { promises as fs } from "fs";
import path from "path";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * ads.txt (Authorized Digital Sellers) is a small text file AdSense requires
 * at the root of the public site to verify that the publisher selling ads
 * through this domain is the legitimate owner. Without it, impressions show
 * as "Unauthorized" and don't count toward payout.
 *
 * This project writes the file directly to public/ads.txt. That works on
 * any host with a writable filesystem (self-hosted Node, Docker, etc.).
 * On serverless hosts like Vercel, public/ is read-only at runtime — the
 * admin UI surfaces a clear warning when a write fails so you can move
 * to a database-backed approach if needed.
 *
 * The pure validator lives in `./ads-txt-format` so it can be imported
 * from client components without dragging in fs / db.
 */

export { validateAdsTxt, type AdsTxtIssue } from "./ads-txt-format";

const SETTINGS_KEY = "adsTxt";

/** Absolute path to the live ads.txt file Next.js serves from /ads.txt. */
export const ADS_TXT_PATH = path.join(process.cwd(), "public", "ads.txt");

/** Default content shipped in the repo, used when the file is missing. */
export const DEFAULT_ADS_TXT = `# ads.txt — Google AdSense seller authorization
# https://adsense.google.com/start/resources/ads-txt
#
# Replace this template with the exact line Google gives you in
#   AdSense → Settings → Account → Account information → "Get the code for your ads.txt snippet"
# Otherwise earnings show as "Unauthorized" and impressions won't count
# toward payout.
`;

export async function getAdsTxt(): Promise<string> {
  // Prefer the file on disk — that's what Next.js actually serves.
  try {
    const file = await fs.readFile(ADS_TXT_PATH, "utf8");
    return file;
  } catch {
    // No file yet — fall back to whatever's in the database.
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEY))
      .limit(1);
    return row?.value ?? DEFAULT_ADS_TXT;
  }
}

/**
 * Save ads.txt contents to disk (the file Next.js serves from /ads.txt) and
 * mirror the content into the `settings` table so the admin UI can read the
 * current value even after the file is moved or removed.
 *
 * Returns the disk-write outcome so the admin UI can warn when running
 * on a host where public/ is read-only (e.g. Vercel). The database write
 * is the source of truth for audit and always succeeds.
 */
export async function saveAdsTxt(contents: string): Promise<{ wroteFile: boolean; fileError?: string }> {
  const trimmed = contents.replace(/\r\n/g, "\n");

  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: trimmed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: trimmed, updatedAt: new Date() },
    });

  try {
    await fs.writeFile(ADS_TXT_PATH, trimmed, "utf8");
    return { wroteFile: true };
  } catch (err) {
    return {
      wroteFile: false,
      fileError: err instanceof Error ? err.message : String(err),
    };
  }
}