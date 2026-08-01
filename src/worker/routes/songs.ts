import { Hono } from "hono";
import { mapSong, type AppEnv, type SongRow } from "../types";

const songs = new Hono<AppEnv>();

songs.get("/", async (c) => {
  const channelId = c.get("channel").id;
  const search = (c.req.query("search") ?? "").trim().toLowerCase();
  const category = (c.req.query("category") ?? "ALL").trim().toUpperCase();

  let sql = "SELECT * FROM songs WHERE channel_id = ? AND enabled = 1";
  const params: (string | number)[] = [channelId];

  if (category && category !== "ALL") {
    sql += " AND UPPER(category) = ?";
    params.push(category);
  }

  if (search) {
    sql += " AND (LOWER(title) LIKE ? OR LOWER(artist) LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like);
  }

  sql += " ORDER BY title COLLATE NOCASE ASC";

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<SongRow>();
  return c.json({ songs: (results ?? []).map(mapSong) });
});

songs.get("/:id", async (c) => {
  const channelId = c.get("channel").id;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT * FROM songs WHERE id = ? AND channel_id = ? AND enabled = 1",
  )
    .bind(id, channelId)
    .first<SongRow>();
  if (!row) return c.json({ error: "Song not found" }, 404);
  return c.json({ song: mapSong(row) });
});

export default songs;
