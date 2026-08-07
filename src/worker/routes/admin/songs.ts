import { Hono } from "hono";
import { newId } from "../../id";
import {
  deleteThumbnailBlob,
  persistThumbnail,
} from "../../thumbnails";
import {
  mapSong,
  normalizeDonationAmount,
  normalizeOriginalUrl,
  type AppEnv,
  type SongRow,
} from "../../types";
import { normalizeCategory, normalizeDifficulty, normalizeGenre } from "./normalize";

const songs = new Hono<AppEnv>();

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

  const category = normalizeCategory(body.category);
  const genre = normalizeGenre(body.genre);
  const difficulty = normalizeDifficulty(body.difficulty);
  const donationAmount = normalizeDonationAmount(body.donationAmount);
  const originalUrl = normalizeOriginalUrl(body.originalUrl);
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  const now = Date.now();
  const id = newId("song");
  const thumbnail = await persistThumbnail(
    c.env,
    channelId,
    id,
    body.thumbnail,
  );

  await c.env.DB.prepare(
    `INSERT INTO songs (id, channel_id, title, artist, category, genre, tags, song_key, bpm, difficulty, donation_amount, thumbnail, original_url, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      channelId,
      title,
      artist,
      category,
      genre,
      JSON.stringify(tags),
      body.songKey ?? null,
      body.bpm ?? null,
      difficulty,
      donationAmount,
      thumbnail,
      originalUrl,
      body.enabled === false ? 0 : 1,
      now,
      now,
    )
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

  const title = body.title !== undefined ? String(body.title).trim() : existing.title;
  const artist = body.artist !== undefined ? String(body.artist).trim() : existing.artist;
  const category =
    body.category !== undefined
      ? normalizeCategory(body.category, existing.category || "")
      : existing.category;
  const genre =
    body.genre !== undefined
      ? normalizeGenre(body.genre, existing.genre || "미분류")
      : (existing.genre ?? "");
  const tags =
    body.tags !== undefined ? JSON.stringify(body.tags.map(String)) : existing.tags;
  const songKey = body.songKey !== undefined ? body.songKey : existing.song_key;
  const bpm = body.bpm !== undefined ? body.bpm : existing.bpm;
  const difficulty =
    body.difficulty !== undefined
      ? normalizeDifficulty(body.difficulty)
      : (existing.difficulty ?? null);
  const donationAmount =
    body.donationAmount !== undefined
      ? normalizeDonationAmount(body.donationAmount)
      : (existing.donation_amount ?? null);
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
  const originalUrl =
    body.originalUrl !== undefined
      ? normalizeOriginalUrl(body.originalUrl)
      : (existing.original_url ?? null);
  const enabled =
    body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled;
  const updatedAt = Date.now();

  await c.env.DB.prepare(
    `UPDATE songs SET title = ?, artist = ?, category = ?, genre = ?, tags = ?, song_key = ?, bpm = ?, difficulty = ?, donation_amount = ?, thumbnail = ?, original_url = ?, enabled = ?, updated_at = ?
     WHERE id = ? AND channel_id = ?`,
  )
    .bind(
      title,
      artist,
      category,
      genre,
      tags,
      songKey,
      bpm,
      difficulty,
      donationAmount,
      thumbnail,
      originalUrl,
      enabled,
      updatedAt,
      id,
      channelId,
    )
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
