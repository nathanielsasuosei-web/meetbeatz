import type { MetadataRoute } from "next";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { beats } from "@/db/schema";

/**
 * XML sitemap for crawlers: the public pages plus every published beat.
 *
 * Dynamic (not prerendered at build time) so a deploy never depends on the
 * database being reachable while building, and new beats appear without a
 * rebuild. The base URL comes from NEXT_PUBLIC_APP_URL when set; otherwise the
 * canonical production host is used for the entries.
 */
export const dynamic = "force-dynamic";

const FALLBACK_BASE = "https://meetbeatz.com";

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return FALLBACK_BASE;
  return configured.replace(/\/+$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/beats`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/sound-kits`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/studio`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/licensing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refunds`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const rows = await db
      .select({ slug: beats.slug, updatedAt: beats.updatedAt })
      .from(beats)
      .where(and(eq(beats.isPublished, true)))
      .orderBy(desc(beats.updatedAt))
      .limit(1000);
    for (const row of rows) {
      pages.push({
        url: `${base}/beats/${row.slug}`,
        lastModified: row.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch (err) {
    // A sitemap without beat URLs is far better than a 500 for crawlers.
    console.warn("[sitemap] could not list beats:", err instanceof Error ? err.message : err);
  }

  return pages;
}
