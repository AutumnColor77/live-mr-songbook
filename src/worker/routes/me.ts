import { Hono } from "hono";
import { sha256Hex, SLUG_RE } from "../crypto";
import { newId } from "../id";
import { loadUserFromSession, randomToken } from "../session";
import type { AppEnv, ChannelRow } from "../types";

const RESERVED_SLUGS = new Set(["demo", "me", "api", "admin", "c"]);

const me = new Hono<AppEnv>();

me.post("/channels", async (c) => {
  const user = await loadUserFromSession(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  let body: { slug?: string; name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!SLUG_RE.test(slug)) {
    return c.json(
      { error: "슬러그는 영문 소문자·숫자·하이픈만 가능합니다 (1–63자)." },
      400,
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    return c.json({ error: "사용할 수 없는 슬러그입니다." }, 400);
  }
  if (!name || name.length > 80) {
    return c.json({ error: "채널 이름(최대 80자)을 입력해 주세요." }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM channels WHERE slug = ?")
    .bind(slug)
    .first();
  if (existing) {
    return c.json({ error: "이미 사용 중인 슬러그입니다." }, 409);
  }

  const id = newId("ch");
  const createdAt = Date.now();
  const adminTokenHash = await sha256Hex(randomToken(32));

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO channels (id, slug, name, admin_token_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(id, slug, name, adminTokenHash, createdAt),
    c.env.DB.prepare(
      `INSERT INTO settings (channel_id, key, value) VALUES (?, 'accepting_requests', 'true')`,
    ).bind(id),
    c.env.DB.prepare(
      `INSERT INTO settings (channel_id, key, value) VALUES (?, 'now_playing_id', '')`,
    ).bind(id),
    c.env.DB.prepare(
      `INSERT INTO channel_members (channel_id, user_id, role, created_at)
       VALUES (?, ?, 'admin', ?)`,
    ).bind(id, user.id, createdAt),
  ]);

  const channel = await c.env.DB.prepare(
    "SELECT id, slug, name, created_at FROM channels WHERE id = ?",
  )
    .bind(id)
    .first<Pick<ChannelRow, "id" | "slug" | "name" | "created_at">>();

  return c.json(
    {
      channel: {
        id: channel!.id,
        slug: channel!.slug,
        name: channel!.name,
        role: "admin",
        createdAt: channel!.created_at,
      },
    },
    201,
  );
});

export default me;
