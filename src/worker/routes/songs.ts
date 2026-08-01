import { Hono } from "hono";
import { mapSong, type Bindings, type SongRow } from "../types";

const songs = new Hono<{ Bindings: Bindings }>();

songs.get("/", async (c) => {
  const search = (c.req.query("search") ?? "").trim().toLowerCase();
  const category = (c.req.query("category") ?? "ALL").trim().toUpperCase();

  let sql = "SELECT * FROM songs WHERE enabled = 1";
  const params: string[] = [];

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

  const stmt = c.env.DB.prepare(sql);
  const { results } = await stmt.bind(...params).all<SongRow>();
  return c.json({ songs: (results ?? []).map(mapSong) });
});

songs.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM songs WHERE id = ? AND enabled = 1")
    .bind(id)
    .first<SongRow>();
  if (!row) return c.json({ error: "Song not found" }, 404);
  return c.json({ song: mapSong(row) });
});

export default songs;
