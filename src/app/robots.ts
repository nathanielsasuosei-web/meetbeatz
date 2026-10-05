import type { MetadataRoute } from "next";

/**
 * Crawler rules. Everything public is open; the admin dashboard, the API and
 * per-order/license pages (which are personal) are kept out of the index.
 */
export const dynamic = "force-dynamic";

const FALLBACK_BASE = "https://meetbeatz.com";

export default function robots(): MetadataRoute.Robots {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured ? configured.replace(/\/+$/, "") : FALLBACK_BASE;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/orders/", "/license/", "/checkout", "/account"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
