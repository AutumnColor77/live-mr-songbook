import { Hono } from "hono";
import { newId } from "../id";
import { mapRequest, type AppEnv, type RequestRow, type SongRow } from "../types";

const requests = new Hono<AppEnv>();

requests.post("/", async (c) => {
  const channelId = c.get("channel").id;

  const accepting = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE channel_id = ? AND key = 'accepting_requests'",
  )
    .bind(channelId)
    .first<{ value: string }>();

  if ((accepting?.value ?? "true") !== "true") {
    return c.json({ error: "Currently not accepting requests" }, 403);
  }

  let body: { songId?: string; nickname?: string; comment?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const songId = typeof body.songId === "string" ? body.songId.trim() : "";
  if (!songId) {
    return c.json({ error: "songId is required" }, 400);
  }

  const song = await c.env.DB.prepare(
    "SELECT * FROM songs WHERE id = ? AND channel_id = ? AND enabled = 1",
  )
    .bind(songId, channelId)
    .first<SongRow>();
  if (!song) {
    return c.json({ error: "Song not found" }, 404);
  }

  const allowDupRow = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE channel_id = ? AND key = 'allow_duplicate_requests'",
  )
    .bind(channelId)
    .first<{ value: string }>();
  const allowDuplicateRequests = (allowDupRow?.value ?? "true") === "true";

  if (!allowDuplicateRequests) {
    const existing = await c.env.DB.prepare(
      `SELECT id FROM requests
       WHERE channel_id = ? AND song_id = ? AND status IN ('pending', 'playing')
       LIMIT 1`,
    )
      .bind(channelId, song.id)
      .first<{ id: string }>();
    if (existing) {
      return c.json({ error: "이미 대기열에 있는 곡입니다." }, 409);
    }
  }

  const nicknameRaw = typeof body.nickname === "string" ? body.nickname.trim() : "";
  const commentRaw = typeof body.comment === "string" ? body.comment.trim() : "";
  const nickname = nicknameRaw.slice(0, 40) || "익명";
  const comment = commentRaw.slice(0, 200);

  const id = newId("req");
  const createdAt = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO requests (id, channel_id, song_id, title, artist, nickname, comment, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(id, channelId, song.id, song.title, song.artist, nickname, comment, createdAt)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM requests WHERE id = ?")
    .bind(id)
    .first<RequestRow>();

  return c.json({ request: mapRequest(row!) }, 201);
});

export default requests;
