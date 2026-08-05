import { Hono } from "hono";
import {
  loadBlockedSongIds,
  loadDuplicatePolicy,
} from "../duplicate-policy";
import { mapRequest, type AppEnv, type RequestRow } from "../types";

const status = new Hono<AppEnv>();

status.get("/", async (c) => {
  const channelId = c.get("channel").id;

  const acceptingRow = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE channel_id = ? AND key = 'accepting_requests'",
  )
    .bind(channelId)
    .first<{ value: string }>();
  const nowPlayingIdRow = await c.env.DB.prepare(
    "SELECT value FROM settings WHERE channel_id = ? AND key = 'now_playing_id'",
  )
    .bind(channelId)
    .first<{ value: string }>();

  const accepting = (acceptingRow?.value ?? "true") === "true";
  const nowPlayingId = nowPlayingIdRow?.value ?? "";
  const { policy, sessionStartedAt } = await loadDuplicatePolicy(c.env.DB, channelId);
  const blockedSongIds = await loadBlockedSongIds(
    c.env.DB,
    channelId,
    policy,
    sessionStartedAt,
  );

  let nowPlaying = null;
  if (nowPlayingId) {
    const row = await c.env.DB.prepare(
      "SELECT * FROM requests WHERE id = ? AND channel_id = ?",
    )
      .bind(nowPlayingId, channelId)
      .first<RequestRow>();
    if (row) nowPlaying = mapRequest(row);
  }

  if (!nowPlaying) {
    const playing = await c.env.DB.prepare(
      "SELECT * FROM requests WHERE channel_id = ? AND status = 'playing' ORDER BY created_at ASC LIMIT 1",
    )
      .bind(channelId)
      .first<RequestRow>();
    if (playing) nowPlaying = mapRequest(playing);
  }

  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE channel_id = ? AND status = 'pending'",
  )
    .bind(channelId)
    .first<{ count: number }>();

  return c.json({
    channel: {
      slug: c.get("channel").slug,
      name: c.get("channel").name,
    },
    acceptingRequests: accepting,
    duplicatePolicy: policy,
    allowDuplicateRequests: policy === "allow",
    blockedSongIds,
    nowPlaying,
    pendingCount: pending?.count ?? 0,
  });
});

export default status;
