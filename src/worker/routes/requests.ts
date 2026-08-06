import { Hono } from "hono";
import {
  findDuplicateConflict,
  loadDuplicatePolicy,
} from "../duplicate-policy";
import { newId } from "../id";
import { songRequiresDonation } from "../request-ingest";
import { loadRequestCommandSettings } from "../request-settings";
import { mapRequest, type AppEnv, type RequestRow, type SongRow } from "../types";

const requests = new Hono<AppEnv>();

requests.post("/", async (c) => {
  const channelId = c.get("channel").id;

  const requestSettings = await loadRequestCommandSettings(c.env.DB, channelId);
  if (requestSettings.mode === "paid") {
    return c.json(
      {
        error:
          "이 채널은 치지직 후원으로만 신청할 수 있습니다. 명령문을 복사해 후원 메시지에 붙여 넣으세요.",
        requestMode: "paid",
      },
      403,
    );
  }

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

  if (songRequiresDonation(song, requestSettings.priceKrw)) {
    const min = Math.round(Number(song.donation_amount) || requestSettings.priceKrw);
    return c.json(
      {
        error: `이 곡은 후원(${min.toLocaleString("ko-KR")}원 이상)으로만 신청할 수 있습니다. 명령문을 복사해 후원 메시지에 붙여 넣으세요.`,
      },
      403,
    );
  }

  const { policy, sessionStartedAt } = await loadDuplicatePolicy(c.env.DB, channelId);
  const conflict = await findDuplicateConflict(
    c.env.DB,
    channelId,
    song.id,
    policy,
    sessionStartedAt,
  );
  if (conflict === "queue") {
    return c.json({ error: "이미 대기열에 있는 곡입니다." }, 409);
  }
  if (conflict === "played") {
    return c.json({ error: "이미 부른 곡입니다." }, 409);
  }

  const nicknameRaw = typeof body.nickname === "string" ? body.nickname.trim() : "";
  const commentRaw = typeof body.comment === "string" ? body.comment.trim() : "";
  const nickname = nicknameRaw.slice(0, 40) || "익명";
  const comment = commentRaw.slice(0, 200);

  const id = newId("req");
  const createdAt = Date.now();

  const maxSort = await c.env.DB.prepare(
    `SELECT MAX(sort_order) AS maxSort FROM requests
     WHERE channel_id = ? AND status IN ('pending', 'playing')`,
  )
    .bind(channelId)
    .first<{ maxSort: number | null }>();
  const sortOrder =
    typeof maxSort?.maxSort === "number" ? maxSort.maxSort + 1 : createdAt;

  await c.env.DB.prepare(
    `INSERT INTO requests (id, channel_id, song_id, title, artist, nickname, comment, status, created_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(id, channelId, song.id, song.title, song.artist, nickname, comment, createdAt, sortOrder)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM requests WHERE id = ?")
    .bind(id)
    .first<RequestRow>();

  return c.json({ request: mapRequest(row!) }, 201);
});

export default requests;
