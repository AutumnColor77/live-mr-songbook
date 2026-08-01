import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { newId } from "../id";
import { mapRequest, mapSong, type Bindings, type RequestRow, type SongRow } from "../types";

const admin = new Hono<{ Bindings: Bindings }>();
admin.use("*", requireAdmin);

const VALID_STATUSES = new Set(["pending", "playing", "done", "rejected"]);
const VALID_CATEGORIES = new Set(["KPOP", "POP", "JPOP", "OST"]);

admin.get("/songs", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM songs ORDER BY title COLLATE NOCASE ASC",
  ).all<SongRow>();
  return c.json({ songs: (results ?? []).map(mapSong) });
});

admin.post("/songs", async (c) => {
  let body: {
    title?: string;
    artist?: string;
    category?: string;
    tags?: string[];
    songKey?: string | null;
    bpm?: number | null;
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

  const category = (body.category ?? "KPOP").toUpperCase();
  if (!VALID_CATEGORIES.has(category)) {
    return c.json({ error: "Invalid category" }, 400);
  }

  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  const now = Date.now();
  const id = newId("song");

  await c.env.DB.prepare(
    `INSERT INTO songs (id, title, artist, category, tags, song_key, bpm, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      title,
      artist,
      category,
      JSON.stringify(tags),
      body.songKey ?? null,
      body.bpm ?? null,
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

admin.patch("/songs/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  if (!existing) return c.json({ error: "Song not found" }, 404);

  let body: Partial<{
    title: string;
    artist: string;
    category: string;
    tags: string[];
    songKey: string | null;
    bpm: number | null;
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
    body.category !== undefined ? String(body.category).toUpperCase() : existing.category;
  if (!VALID_CATEGORIES.has(category)) {
    return c.json({ error: "Invalid category" }, 400);
  }
  const tags =
    body.tags !== undefined ? JSON.stringify(body.tags.map(String)) : existing.tags;
  const songKey = body.songKey !== undefined ? body.songKey : existing.song_key;
  const bpm = body.bpm !== undefined ? body.bpm : existing.bpm;
  const enabled =
    body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled;
  const updatedAt = Date.now();

  await c.env.DB.prepare(
    `UPDATE songs SET title = ?, artist = ?, category = ?, tags = ?, song_key = ?, bpm = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(title, artist, category, tags, songKey, bpm, enabled, updatedAt, id)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  return c.json({ song: mapSong(row!) });
});

admin.delete("/songs/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM songs WHERE id = ?")
    .bind(id)
    .first();
  if (!existing) return c.json({ error: "Song not found" }, 404);

  await c.env.DB.prepare("DELETE FROM songs WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

admin.patch("/settings", async (c) => {
  let body: { acceptingRequests?: boolean; nowPlayingId?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.acceptingRequests !== undefined) {
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('accepting_requests', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
      .bind(body.acceptingRequests ? "true" : "false")
      .run();
  }

  if (body.nowPlayingId !== undefined) {
    const value = body.nowPlayingId ?? "";
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('now_playing_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
      .bind(value)
      .run();

    if (value) {
      await c.env.DB.prepare("UPDATE requests SET status = 'playing' WHERE id = ?")
        .bind(value)
        .run();
    }
  }

  return c.json({ ok: true });
});

admin.patch("/requests/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM requests WHERE id = ?")
    .bind(id)
    .first<RequestRow>();
  if (!existing) return c.json({ error: "Request not found" }, 404);

  let body: { status?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const status = body.status ?? "";
  if (!VALID_STATUSES.has(status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  await c.env.DB.prepare("UPDATE requests SET status = ? WHERE id = ?")
    .bind(status, id)
    .run();

  if (status === "playing") {
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('now_playing_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
      .bind(id)
      .run();
  }

  if (status === "done" || status === "rejected") {
    const current = await c.env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'now_playing_id'",
    ).first<{ value: string }>();
    if (current?.value === id) {
      await c.env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('now_playing_id', '') ON CONFLICT(key) DO UPDATE SET value = ''",
      ).run();
    }
  }

  const row = await c.env.DB.prepare("SELECT * FROM requests WHERE id = ?")
    .bind(id)
    .first<RequestRow>();
  return c.json({ request: mapRequest(row!) });
});

admin.get("/requests", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM requests ORDER BY created_at DESC LIMIT 200",
  ).all<RequestRow>();
  return c.json({ requests: (results ?? []).map(mapRequest) });
});

export default admin;
