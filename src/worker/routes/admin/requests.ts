import { Hono } from "hono";
import { upsertSetting } from "../../channel-settings";
import { mapRequest, type AppEnv, type RequestRow } from "../../types";

const requests = new Hono<AppEnv>();
const VALID_STATUSES = new Set(["pending", "playing", "done", "rejected"]);

requests.patch("/requests/:id", async (c) => {
  const channelId = c.get("channel").id;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare(
    "SELECT * FROM requests WHERE id = ? AND channel_id = ?",
  )
    .bind(id, channelId)
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

  await c.env.DB.prepare(
    "UPDATE requests SET status = ? WHERE id = ? AND channel_id = ?",
  )
    .bind(status, id, channelId)
    .run();

  if (status === "playing") {
    await upsertSetting(c.env.DB, channelId, "now_playing_id", id).run();
  }

  if (status === "done" || status === "rejected") {
    const current = await c.env.DB.prepare(
      "SELECT value FROM settings WHERE channel_id = ? AND key = 'now_playing_id'",
    )
      .bind(channelId)
      .first<{ value: string }>();
    if (current?.value === id) {
      await upsertSetting(c.env.DB, channelId, "now_playing_id", "").run();
    }
  }

  const row = await c.env.DB.prepare("SELECT * FROM requests WHERE id = ?")
    .bind(id)
    .first<RequestRow>();
  return c.json({ request: mapRequest(row!) });
});

requests.get("/requests", async (c) => {
  const channelId = c.get("channel").id;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM requests WHERE channel_id = ?
     ORDER BY sort_order ASC, created_at ASC
     LIMIT 200`,
  )
    .bind(channelId)
    .all<RequestRow>();
  return c.json({ requests: (results ?? []).map(mapRequest) });
});


export default requests;
