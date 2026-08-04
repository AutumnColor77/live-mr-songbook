import { Hono } from "hono";
import { sha256Hex, SLUG_RE } from "../crypto";
import { newId } from "../id";
import { loadUserFromSession, randomToken } from "../session";
import type { AppEnv, ChannelRow } from "../types";

const RESERVED_SLUGS = new Set(["demo", "me", "api", "admin", "c"]);

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function shortSuffix(): string {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  return [...buf]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 5);
}

async function allocateSlug(
  db: D1Database,
  preferred: string,
  name: string,
): Promise<string | null> {
  const fromName = slugifyName(name);
  let base =
    preferred && SLUG_RE.test(preferred) && !RESERVED_SLUGS.has(preferred)
      ? preferred
      : fromName && SLUG_RE.test(fromName) && !RESERVED_SLUGS.has(fromName)
        ? fromName
        : `ch-${shortSuffix()}`;

  if (!SLUG_RE.test(base) || RESERVED_SLUGS.has(base)) {
    base = `ch-${shortSuffix()}`;
  }

  for (let i = 0; i < 24; i++) {
    const candidate =
      i === 0
        ? base
        : i < 8
          ? `${base.slice(0, 55)}-${i + 1}`
          : `${(fromName || "ch").slice(0, 50)}-${shortSuffix()}`;
    if (!SLUG_RE.test(candidate) || RESERVED_SLUGS.has(candidate)) continue;
    const existing = await db
      .prepare("SELECT id FROM channels WHERE slug = ?")
      .bind(candidate)
      .first();
    if (!existing) return candidate;
  }
  return null;
}

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

  const preferred =
    typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > 80) {
    return c.json({ error: "채널 이름(최대 80자)을 입력해 주세요." }, 400);
  }

  const alreadyOwns = await c.env.DB.prepare(
    `SELECT c.id FROM channel_members cm
     JOIN channels c ON c.id = cm.channel_id
     WHERE cm.user_id = ? AND c.slug != 'demo'
     LIMIT 1`,
  )
    .bind(user.id)
    .first();
  if (alreadyOwns) {
    return c.json({ error: "계정당 채널은 1개만 만들 수 있습니다." }, 409);
  }

  if (preferred && (!SLUG_RE.test(preferred) || RESERVED_SLUGS.has(preferred))) {
    return c.json(
      { error: "슬러그는 영문 소문자·숫자·하이픈만 가능합니다 (1–63자)." },
      400,
    );
  }

  const slug = await allocateSlug(c.env.DB, preferred, name);
  if (!slug) {
    return c.json(
      { error: "사용 가능한 URL을 만들지 못했습니다. 다시 시도해 주세요." },
      409,
    );
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

me.patch("/channels/:id", async (c) => {
  const user = await loadUserFromSession(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const channelId = c.req.param("id");
  const membership = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.name, c.created_at, cm.role
     FROM channel_members cm
     JOIN channels c ON c.id = cm.channel_id
     WHERE cm.user_id = ? AND cm.channel_id = ? AND cm.role = 'admin'`,
  )
    .bind(user.id, channelId)
    .first<{
      id: string;
      slug: string;
      name: string;
      created_at: number;
      role: string;
    }>();

  if (!membership) {
    return c.json({ error: "채널을 찾을 수 없거나 수정 권한이 없습니다." }, 404);
  }
  if (membership.slug === "demo") {
    return c.json({ error: "데모 채널은 수정할 수 없습니다." }, 403);
  }

  let body: { slug?: string; name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const nextName =
    body.name !== undefined
      ? String(body.name).trim()
      : membership.name;
  if (!nextName || nextName.length > 80) {
    return c.json({ error: "채널 이름(최대 80자)을 입력해 주세요." }, 400);
  }

  let nextSlug = membership.slug;
  if (body.slug !== undefined) {
    const preferred = String(body.slug).trim().toLowerCase();
    if (!preferred) {
      return c.json({ error: "슬러그를 입력해 주세요." }, 400);
    }
    if (!SLUG_RE.test(preferred) || RESERVED_SLUGS.has(preferred)) {
      return c.json(
        { error: "슬러그는 영문 소문자·숫자·하이픈만 가능합니다 (1–63자)." },
        400,
      );
    }
    if (preferred !== membership.slug) {
      const taken = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE slug = ? AND id != ?",
      )
        .bind(preferred, channelId)
        .first();
      if (taken) {
        return c.json({ error: "이미 사용 중인 주소입니다." }, 409);
      }
      nextSlug = preferred;
    }
  }

  if (nextName === membership.name && nextSlug === membership.slug) {
    return c.json({
      channel: {
        id: membership.id,
        slug: membership.slug,
        name: membership.name,
        role: membership.role,
        createdAt: membership.created_at,
      },
    });
  }

  await c.env.DB.prepare(
    "UPDATE channels SET name = ?, slug = ? WHERE id = ?",
  )
    .bind(nextName, nextSlug, channelId)
    .run();

  return c.json({
    channel: {
      id: membership.id,
      slug: nextSlug,
      name: nextName,
      role: membership.role,
      createdAt: membership.created_at,
    },
  });
});

export default me;
