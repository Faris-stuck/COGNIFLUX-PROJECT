import type { MetadataRoute } from "next";
import { listPrepPrograms, listPrepSubjects } from "@/lib/prep-catalog";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cogniflux.web.id";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/search`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/learn`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/research`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/explore`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/persiapan`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
  ];
  try {
    const programs = await listPrepPrograms();
    for (const program of programs) {
      for (const subject of await listPrepSubjects(program.id)) {
        routes.push({
          url: `${SITE_URL}/persiapan/${encodeURIComponent(program.slug)}/${encodeURIComponent(subject.slug)}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }
  } catch {
    // Keep the core sitemap available if the catalog DB is temporarily unavailable.
  }
  return routes;
}
