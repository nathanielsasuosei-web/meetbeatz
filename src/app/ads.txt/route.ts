import { DEFAULT_ADS_TXT, getAdsTxt } from "@/lib/ads-txt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Serve the current ads.txt at the domain root. Reading it from PostgreSQL
 * lets the Admin editor update the live file on serverless deployments too.
 */
export async function GET() {
  try {
    const contents = await getAdsTxt();
    return new Response(`${contents.replace(/\n*$/, "")}\n`, { headers });
  } catch (error) {
    // Keep the endpoint crawlable even before the database is provisioned or
    // during a temporary database outage. The fallback contains no seller
    // authorization records, so it cannot incorrectly authorize inventory.
    console.error("[ads.txt] Could not load the configured file:", error);
    return new Response(DEFAULT_ADS_TXT, { headers });
  }
}
