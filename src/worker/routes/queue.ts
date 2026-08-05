import { Hono } from "hono";
import { mapRequest, type AppEnv, type RequestRow } from "../types";

const queue = new Hono<AppEnv>();

queue.get("/", async (c) => {
  const channelId = c.get("channel").id;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM requests
     WHERE channel_id = ? AND status IN ('pending', 'playing')
     ORDER BY sort_order ASC, created_at ASC`,
  )
    .bind(channelId)
    .all<RequestRow>();

  return c.json({ queue: (results ?? []).map(mapRequest) });
});

export default queue;
