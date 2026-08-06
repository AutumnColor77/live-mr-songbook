import { Hono } from "hono";
import type { AppEnv } from "../types";

const directory = new Hono<AppEnv>();

type DirectoryRow = {
  slug: string;
  name: string;
  song_count: number;
};

/** Public channel directory for the viewer home page. No auth. */
directory.get("/channels", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const like = q ? `%${q.replace(/[%_]/g, "")}%` : "";

  const sql = `
    SELECT
      c.slug AS slug,
      c.name AS name,
      COALESCE(COUNT(s.id), 0) AS song_count
    FROM channels c
    LEFT JOIN songs s
      ON s.channel_id = c.id AND s.enabled = 1
    ${q ? "WHERE (c.name LIKE ? OR c.slug LIKE ?)" : ""}
    GROUP BY c.id
    ORDER BY
      CASE WHEN c.slug = 'demo' THEN 0 ELSE 1 END,
      c.name COLLATE NOCASE ASC
  `;

  const stmt = q
    ? c.env.DB.prepare(sql).bind(like, like)
    : c.env.DB.prepare(sql);

  const { results } = await stmt.all<DirectoryRow>();

  return c.json({
    channels: (results ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      songCount: Number(row.song_count) || 0,
      isDemo: row.slug === "demo",
    })),
  });
});

export default directory;
