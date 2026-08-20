import { Hono } from "hono";
import type { AppEnv } from "../types";

const CANONICAL_ORIGIN = "https://livemrsongbook.com";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function urlEntry(loc: string): string {
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`;
}

const sitemap = new Hono<AppEnv>();

/** Public channel pages for Google Search Console. Same visibility as the directory. */
sitemap.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT slug FROM channels WHERE slug != 'demo' ORDER BY name COLLATE NOCASE ASC`,
  ).all<{ slug: string }>();

  const locs = [
    `${CANONICAL_ORIGIN}/`,
    ...(results ?? []).map((row) => `${CANONICAL_ORIGIN}/c/${row.slug}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map(urlEntry).join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});

export default sitemap;
