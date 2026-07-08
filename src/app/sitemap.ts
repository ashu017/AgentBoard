import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

// Only the public marketing landing is indexable. The app (/board), auth, and
// API routes are excluded — they're disallowed in robots.ts too.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_ORIGIN}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
