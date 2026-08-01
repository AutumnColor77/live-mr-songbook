import type { Context, Next } from "hono";
import { bearerToken, sha256Hex, SLUG_RE } from "./crypto";
import type { AppEnv, ChannelRow } from "./types";

export async function loadChannel(c: Context<AppEnv>, next: Next) {
  const raw = c.req.param("slug") ?? "";
  const slug = raw.toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return c.json({ error: "Invalid channel slug" }, 400);
  }

  const channel = await c.env.DB.prepare("SELECT * FROM channels WHERE slug = ?")
    .bind(slug)
    .first<ChannelRow>();

  if (!channel) {
    return c.json({ error: "Channel not found" }, 404);
  }

  c.set("channel", channel);
  await next();
}

export async function requireChannelAdmin(c: Context<AppEnv>, next: Next) {
  const provided = bearerToken(c.req.header("Authorization"));
  if (!provided) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hash = await sha256Hex(provided);
  if (hash !== c.get("channel").admin_token_hash) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
}

export async function requirePlatformAdmin(c: Context<AppEnv>, next: Next) {
  const expected = c.env.PLATFORM_ADMIN_TOKEN;
  if (!expected) {
    return c.json({ error: "Platform admin token not configured" }, 500);
  }

  const provided = bearerToken(c.req.header("Authorization"));
  if (!provided || provided !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
}
