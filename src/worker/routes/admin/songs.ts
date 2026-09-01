import { Hono } from "hono";
import { newId } from "../../id";
import {
  deleteThumbnailBlob,
  persistThumbnail,
} from "../../thumbnails";
import {
  mapSong,
  type AppEnv,
  type SongRow,
} from "../../types";
import {
  fieldsFromPostPayload,
  INSERT_SONG_SQL,
  mergePatchSongFields,
  songInsertBinds,
  songUpdateBinds,
  UPDATE_SONG_SQL,
} from "./song-fields";
import songSync from "./song-sync";

const songs = new Hono<AppEnv>();
songs.route("/", songSync);

songs.get("/songs", async (c) => {
  const channelId = c.get("channel").id;
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM songs WHERE channel_id = ? ORDER BY title COLLATE NOCASE ASC",
  )
    .bind(channelId)
    .all<SongRow>();
  return c.json({ songs: (results ?? []).map(mapSong) });
});

songs.post("/songs", async (c) => {
  const channelId = c.get("channel").id;
  let body: {
    title?: string;
    artist?: string;
    category?: string;
    genre?: string;
    tags?: string[];
    songKey?: string | null;
    bpm?: number | null;
    difficulty?: number | null;
    donationAmount?: number | null;
    thumbnail?: string | null;
    originalUrl?: string | null;
    enabled?: boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const artist = typeof body.artist === "string" ? body.artist.trim() : "";
  if (!title || !artist) {
    return c.json({ error: "title and artist are required" }, 400);
  }

  const fields = fieldsFromPostPayload(
    body,
    title,
    artist,
    body.enabled === false ? 0 : 1,
  );
  const now = Date.now();
  const id = newId("song");
  const thumbnail = await persistThumbnail(
    c.env,
    channelId,
    id,
    body.thumbnail,
  );

  await c.env.DB.prepare(INSERT_SONG_SQL)
    .bind(...songInsertBinds(id, channelId, fields, thumbnail, now))
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  return c.json({ song: mapSong(row!) }, 201);
});

songs.patch("/songs/:id", async (c) => {
  const channelId = c.get("channel").id;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare(
    "SELECT * FROM songs WHERE id = ? AND channel_id = ?",
  )
    .bind(id, channelId)
    .first<SongRow>();
  if (!existing) return c.json({ error: "Song not found" }, 404);

  let body: Partial<{
    title: string;
    artist: string;
    category: string;
    genre: string;
    tags: string[];
    songKey: string | null;
    bpm: number | null;
    difficulty: number | null;
    donationAmount: number | null;
    thumbnail: string | null;
    originalUrl: string | null;
    enabled: boolean;
  }>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const fields = mergePatchSongFields(existing, body);
  const thumbnail =
    body.thumbnail !== undefined
      ? await persistThumbnail(
          c.env,
          channelId,
          id,
          body.thumbnail,
          existing.thumbnail ?? "",
        )
      : (existing.thumbnail ?? "");
  const updatedAt = Date.now();

  await c.env.DB.prepare(UPDATE_SONG_SQL)
    .bind(...songUpdateBinds(fields, thumbnail, updatedAt, id, channelId))
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  return c.json({ song: mapSong(row!) });
});

songs.delete("/songs/:id", async (c) => {
  const channelId = c.get("channel").id;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare(
    "SELECT id, thumbnail FROM songs WHERE id = ? AND channel_id = ?",
  )
    .bind(id, channelId)
    .first<{ id: string; thumbnail: string }>();
  if (!existing) return c.json({ error: "Song not found" }, 404);

  await deleteThumbnailBlob(c.env, channelId, id, existing.thumbnail ?? "");
  await c.env.DB.prepare("DELETE FROM songs WHERE id = ? AND channel_id = ?")
    .bind(id, channelId)
    .run();
  return c.json({ ok: true });
});

export default songs;
