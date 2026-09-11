import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cogniflux.web.id";

/**
 * robots.txt
 *
 * Public discovery pages are crawlable. Everything user-specific or API-shaped is
 * disallowed: /api/* returns JSON (no SEO value, and crawling it burns upstream
 * provider quota), /library and /login are per-user, and /read/* is derived
 * full-text that belongs to the upstream publisher rather than to us.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/library", "/login", "/read/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
