import { Hono } from "hono";
import { upsertSetting } from "../../channel-settings";
import type { AppEnv } from "../../types";

const queue = new Hono<AppEnv>();

// Clears the live queue while keeping request history: active items become
// 'rejected' rather than 'done' so they are not counted as performed.
queue.post("/queue/clear", async (c) => {
  const channelId = c.get("channel").id;
  const sessionStartedAt = String(Date.now());

  const active = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE channel_id = ? AND status IN ('pending', 'playing')",
  )
    .bind(channelId)
    .first<{ count: number }>();

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE requests SET status = 'rejected' WHERE channel_id = ? AND status IN ('pending', 'playing')",
    ).bind(channelId),
    upsertSetting(c.env.DB, channelId, "now_playing_id", ""),
    upsertSetting(c.env.DB, channelId, "duplicate_session_started_at", sessionStartedAt),
  ]);

  return c.json({ ok: true, cleared: active?.count ?? 0 });
});

queue.post("/queue/reorder", async (c) => {
  const channelId = c.get("channel").id;
  let body: { ids?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (ids.length === 0) {
    return c.json({ error: "ids array is required" }, 400);
  }
  if (new Set(ids).size !== ids.length) {
    return c.json({ error: "ids must be unique" }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id FROM requests
     WHERE channel_id = ? AND status IN ('pending', 'playing')`,
  )
    .bind(channelId)
    .all<{ id: string }>();

  const activeIds = new Set((results ?? []).map((r) => r.id));
  if (activeIds.size !== ids.length || ids.some((id) => !activeIds.has(id))) {
    return c.json({ error: "ids must match the current active queue exactly" }, 400);
  }

  await c.env.DB.batch(
    ids.map((id, index) =>
      c.env.DB.prepare(
        "UPDATE requests SET sort_order = ? WHERE id = ? AND channel_id = ?",
      ).bind(index, id, channelId),
    ),
  );

  return c.json({ ok: true });
});

export default queue;
