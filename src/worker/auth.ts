import type { Context, Next } from "hono";
import { bearerToken, sha256Hex, SLUG_RE } from "./crypto";
import { loadUserFromSession } from "./session";
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

/** Demo channel: any signed-in Google user gets admin membership. */
export async function ensureDemoMembership(
  db: D1Database,
  userId: string,
): Promise<void> {
  const demo = await db
    .prepare("SELECT id FROM channels WHERE slug = 'demo'")
    .first<{ id: string }>();
  if (!demo) return;

  const existing = await db
    .prepare("SELECT user_id FROM channel_members WHERE channel_id = ? AND user_id = ?")
    .bind(demo.id, userId)
    .first();
  if (existing) return;

  await db
    .prepare(
      `INSERT INTO channel_members (channel_id, user_id, role, created_at)
       VALUES (?, ?, 'admin', ?)`,
    )
    .bind(demo.id, userId, Date.now())
    .run();
}

async function userCanAdminChannel(
  db: D1Database,
  channel: ChannelRow,
  userId: string,
): Promise<boolean> {
  if (channel.slug === "demo") {
    await ensureDemoMembership(db, userId);
    return true;
  }

  const member = await db
    .prepare("SELECT user_id FROM channel_members WHERE channel_id = ? AND user_id = ?")
    .bind(channel.id, userId)
    .first();
  return Boolean(member);
}

export async function requireChannelAdmin(c: Context<AppEnv>, next: Next) {
  const channel = c.get("channel");

  // 1) Google session cookie
  const user = await loadUserFromSession(c);
  if (user && (await userCanAdminChannel(c.env.DB, channel, user.id))) {
    await next();
    return;
  }

  // 2) Legacy channel admin token (API / platform tooling)
  const provided = bearerToken(c.req.header("Authorization"));
  if (provided) {
    const hash = await sha256Hex(provided);
    if (hash === channel.admin_token_hash) {
      await next();
      return;
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
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
