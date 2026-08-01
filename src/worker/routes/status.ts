import { Hono } from "hono";
import { mapRequest, type Bindings, type RequestRow } from "../types";

const status = new Hono<{ Bindings: Bindings }>();

status.get("/", async (c) => {
  const acceptingRow = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'accepting_requests'",
  ).first<{ value: string }>();
  const nowPlayingIdRow = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'now_playing_id'",
  ).first<{ value: string }>();

  const accepting = (acceptingRow?.value ?? "true") === "true";
  const nowPlayingId = nowPlayingIdRow?.value ?? "";

  let nowPlaying = null;
  if (nowPlayingId) {
    const row = await c.env.DB.prepare("SELECT * FROM requests WHERE id = ?")
      .bind(nowPlayingId)
      .first<RequestRow>();
    if (row) nowPlaying = mapRequest(row);
  }

  if (!nowPlaying) {
    const playing = await c.env.DB.prepare(
      "SELECT * FROM requests WHERE status = 'playing' ORDER BY created_at ASC LIMIT 1",
    ).first<RequestRow>();
    if (playing) nowPlaying = mapRequest(playing);
  }

  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE status = 'pending'",
  ).first<{ count: number }>();

  return c.json({
    acceptingRequests: accepting,
    nowPlaying,
    pendingCount: pending?.count ?? 0,
  });
});

export default status;
