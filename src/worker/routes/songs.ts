import { Hono } from "hono";
import { mapSong, type AppEnv, type SongRow } from "../types";

const songs = new Hono<AppEnv>();

songs.get("/", async (c) => {
  const channelId = c.get("channel").id;
  const search = (c.req.query("search") ?? "").trim().toLowerCase();
  const genre = (c.req.query("genre") ?? "ALL").trim();
  const artist = (c.req.query("artist") ?? "ALL").trim();
  // legacy alias
  const categoryFilter = (c.req.query("category") ?? "").trim();
  const activeGenre =
    genre && genre.toUpperCase() !== "ALL"
      ? genre
      : categoryFilter && categoryFilter.toUpperCase() !== "ALL"
        ? categoryFilter
        : "";
  const activeArtist = artist && artist.toUpperCase() !== "ALL" ? artist : "";

  let sql = "SELECT * FROM songs WHERE channel_id = ? AND enabled = 1";
  const params: (string | number)[] = [channelId];

  if (activeGenre) {
    sql += " AND (LOWER(COALESCE(NULLIF(TRIM(genre), ''), category)) = LOWER(?))";
    params.push(activeGenre);
  }

  if (activeArtist) {
    sql += " AND LOWER(TRIM(artist)) = LOWER(?)";
    params.push(activeArtist);
  }

  if (search) {
    sql += " AND (LOWER(title) LIKE ? OR LOWER(artist) LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like);
  }

  sql += " ORDER BY title COLLATE NOCASE ASC";

  const [{ results }, { results: genreRows }, { results: artistRows }] =
    await Promise.all([
      c.env.DB.prepare(sql).bind(...params).all<SongRow>(),
      c.env.DB.prepare(
        `SELECT DISTINCT TRIM(
            CASE
              WHEN TRIM(COALESCE(genre, '')) != '' THEN genre
              ELSE category
            END
          ) AS label
         FROM songs
         WHERE channel_id = ? AND enabled = 1
           AND TRIM(
             CASE
               WHEN TRIM(COALESCE(genre, '')) != '' THEN genre
               ELSE category
             END
           ) != ''
         ORDER BY label COLLATE NOCASE ASC`,
      )
        .bind(channelId)
        .all<{ label: string }>(),
      c.env.DB.prepare(
        `SELECT DISTINCT TRIM(artist) AS label
         FROM songs
         WHERE channel_id = ? AND enabled = 1 AND TRIM(artist) != ''
         ORDER BY label COLLATE NOCASE ASC`,
      )
        .bind(channelId)
        .all<{ label: string }>(),
    ]);

  return c.json({
    songs: (results ?? []).map(mapSong),
    genres: (genreRows ?? []).map((row) => row.label),
    artists: (artistRows ?? []).map((row) => row.label),
    categories: (genreRows ?? []).map((row) => row.label),
  });
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
