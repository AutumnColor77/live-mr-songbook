import { Hono } from "hono";
import type { AppEnv } from "../types";

const directory = new Hono<AppEnv>();

type DirectoryRow = {
  slug: string;
  name: string;
  song_count: number;
  picture: string | null;
  owner_name: string | null;
};

/** Public channel directory for the viewer home page. No auth. */
directory.get("/channels", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const like = q ? `%${q.replace(/[%_]/g, "")}%` : "";

  const sql = `
    SELECT
      c.slug AS slug,
      c.name AS name,
      COALESCE(COUNT(s.id), 0) AS song_count,
      (
        SELECT u.picture
        FROM channel_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = c.id AND cm.role = 'admin'
        ORDER BY cm.created_at ASC
        LIMIT 1
      ) AS picture,
      (
        SELECT u.name
        FROM channel_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = c.id AND cm.role = 'admin'
        ORDER BY cm.created_at ASC
        LIMIT 1
      ) AS owner_name
    FROM channels c
    LEFT JOIN songs s
      ON s.channel_id = c.id AND s.enabled = 1
    WHERE c.slug != 'demo'
      ${q ? "AND (c.name LIKE ? OR c.slug LIKE ?)" : ""}
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
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
      picture: row.picture?.trim() || "",
      ownerName: row.owner_name?.trim() || "",
    })),
  });
});

export default directory;
