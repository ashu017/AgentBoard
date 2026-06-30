import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

// Landing page indexable; the app, auth, and API surfaces are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/board", "/login", "/api", "/auth"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
