import { Hono } from "hono";
import { requirePlatformAdmin } from "../auth";
import { seedDefaultChannelSettings } from "../channel-settings";
import { sha256Hex, SLUG_RE } from "../crypto";
import { newId } from "../id";
import type { AppEnv, ChannelRow } from "../types";

const platform = new Hono<AppEnv>();
platform.use("*", requirePlatformAdmin);

platform.post("/channels", async (c) => {
  let body: { slug?: string; name?: string; adminToken?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const adminToken = typeof body.adminToken === "string" ? body.adminToken.trim() : "";

  if (!SLUG_RE.test(slug)) {
    return c.json(
      { error: "slug must be 1–63 chars: lowercase letters, numbers, hyphens" },
      400,
    );
  }
  if (!name || name.length > 80) {
    return c.json({ error: "name is required (max 80 chars)" }, 400);
  }
  if (adminToken.length < 16) {
    return c.json({ error: "adminToken must be at least 16 characters" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT id FROM channels WHERE slug = ?")
    .bind(slug)
    .first();
  if (existing) {
    return c.json({ error: "slug already taken" }, 409);
  }

  const id = newId("ch");
  const createdAt = Date.now();
  const adminTokenHash = await sha256Hex(adminToken);

  await c.env.DB.prepare(
    `INSERT INTO channels (id, slug, name, admin_token_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, slug, name, adminTokenHash, createdAt)
    .run();

  await c.env.DB.batch(seedDefaultChannelSettings(c.env.DB, id, createdAt));

  const channel = await c.env.DB.prepare("SELECT id, slug, name, created_at FROM channels WHERE id = ?")
    .bind(id)
    .first<Pick<ChannelRow, "id" | "slug" | "name" | "created_at">>();

  return c.json(
    {
      channel: {
        id: channel!.id,
        slug: channel!.slug,
        name: channel!.name,
        createdAt: channel!.created_at,
      },
    },
    201,
  );
});

platform.get("/channels", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, slug, name, created_at FROM channels ORDER BY created_at ASC",
  ).all<Pick<ChannelRow, "id" | "slug" | "name" | "created_at">>();

  return c.json({
    channels: (results ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      createdAt: row.created_at,
    })),
  });
});

export default platform;
