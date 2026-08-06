import { Hono } from "hono";
import { upsertSetting } from "../../channel-settings";
import { isDuplicatePolicy } from "../../duplicate-policy";
import { isRequestMode } from "../../request-settings";
import type { AppEnv } from "../../types";

const settings = new Hono<AppEnv>();

settings.patch("/settings", async (c) => {
  const channelId = c.get("channel").id;
  let body: {
    acceptingRequests?: boolean;
    allowDuplicateRequests?: boolean;
    duplicatePolicy?: string;
    nowPlayingId?: string | null;
    requestMode?: string;
    requestPriceKrw?: number;
    requestCommandPrefix?: string;
    requestCommandSeparator?: string;
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

  if (body.requestMode !== undefined) {
    if (!isRequestMode(body.requestMode)) {
      return c.json({ error: "Invalid requestMode" }, 400);
    }
    await upsertSetting(c.env.DB, channelId, "request_mode", body.requestMode).run();
  }

  if (body.requestPriceKrw !== undefined) {
    const n =
      typeof body.requestPriceKrw === "number"
        ? body.requestPriceKrw
        : Number(body.requestPriceKrw);
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      return c.json({ error: "Invalid requestPriceKrw" }, 400);
    }
    await upsertSetting(
      c.env.DB,
      channelId,
      "request_price_krw",
      String(Math.round(n)),
    ).run();
  }

  if (body.requestCommandPrefix !== undefined) {
    if (typeof body.requestCommandPrefix !== "string") {
      return c.json({ error: "Invalid requestCommandPrefix" }, 400);
    }
    const prefix = body.requestCommandPrefix.trim().slice(0, 40);
    if (!prefix) {
      return c.json({ error: "requestCommandPrefix cannot be empty" }, 400);
    }
    await upsertSetting(c.env.DB, channelId, "request_command_prefix", prefix).run();
  }

  if (body.requestCommandSeparator !== undefined) {
    if (typeof body.requestCommandSeparator !== "string") {
      return c.json({ error: "Invalid requestCommandSeparator" }, 400);
    }
    const sep = body.requestCommandSeparator.trim().slice(0, 8) || "-";
    await upsertSetting(c.env.DB, channelId, "request_command_separator", sep).run();
  }

  return c.json({ ok: true });
});

export default settings;
