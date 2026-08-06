import { Hono } from "hono";
import { upsertSetting } from "../../channel-settings";
import { isDuplicatePolicy } from "../../duplicate-policy";
import type { AppEnv } from "../../types";

const settings = new Hono<AppEnv>();

settings.patch("/settings", async (c) => {
  const channelId = c.get("channel").id;
  let body: {
    acceptingRequests?: boolean;
    allowDuplicateRequests?: boolean;
    duplicatePolicy?: string;
    nowPlayingId?: string | null;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.acceptingRequests !== undefined) {
    await upsertSetting(
      c.env.DB,
      channelId,
      "accepting_requests",
      body.acceptingRequests ? "true" : "false",
    ).run();
  }

  if (body.duplicatePolicy !== undefined) {
    if (!isDuplicatePolicy(body.duplicatePolicy)) {
      return c.json({ error: "Invalid duplicatePolicy" }, 400);
    }
    await upsertSetting(c.env.DB, channelId, "duplicate_policy", body.duplicatePolicy).run();
  } else if (body.allowDuplicateRequests !== undefined) {
    // Legacy boolean → map to allow/queue
    const policy = body.allowDuplicateRequests ? "allow" : "queue";
    await upsertSetting(c.env.DB, channelId, "duplicate_policy", policy).run();
  }

  if (body.nowPlayingId !== undefined) {
    const value = body.nowPlayingId ?? "";
    await upsertSetting(c.env.DB, channelId, "now_playing_id", value).run();

    if (value) {
      await c.env.DB.prepare(
        "UPDATE requests SET status = 'playing' WHERE id = ? AND channel_id = ?",
      )
        .bind(value, channelId)
        .run();
    }
  }

  return c.json({ ok: true });
});

export default settings;
