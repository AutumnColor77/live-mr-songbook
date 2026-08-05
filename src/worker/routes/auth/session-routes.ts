import { Hono } from "hono";
import { ensureDemoMembership } from "../../auth";
import {
  destroySession,
  loadUserFromSession,
  updateUserProfile,
} from "../../session";
import type { AppEnv } from "../../types";
import {
  googleConfigured,
  naverConfigured,
  originFromRequest,
} from "./helpers";

async function listChannelsForUser(db: D1Database, userId: string) {
  await ensureDemoMembership(db, userId);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.slug, c.name, cm.role
       FROM channel_members cm
       JOIN channels c ON c.id = cm.channel_id
       WHERE cm.user_id = ?
       ORDER BY CASE WHEN c.slug = 'demo' THEN 1 ELSE 0 END, c.name COLLATE NOCASE ASC`,
    )
    .bind(userId)
    .all<{ id: string; slug: string; name: string; role: string }>();

  return (results ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role || "admin",
  }));
}



const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.get("/me", async (c) => {
  const user = await loadUserFromSession(c);
  if (!user) return c.json({ user: null, channels: [] });
  const channels = await listChannelsForUser(c.env.DB, user.id);
  return c.json({ user, channels });
});

sessionRoutes.patch("/profile", async (c) => {
  const sessionUser = await loadUserFromSession(c);
  if (!sessionUser) return c.json({ error: "Unauthorized" }, 401);

  let body: { name?: string; picture?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const name = typeof body.name === "string" ? body.name : "";
  const picture = typeof body.picture === "string" ? body.picture : "";
  const row = await updateUserProfile(c.env.DB, sessionUser.id, { name, picture });
  if (!row) {
    return c.json(
      { error: "닉네임(1–32자)과 올바른 프로필 이미지를 확인해 주세요." },
      400,
    );
  }
  return c.json({ user: {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    needsProfileSetup: !row.profile_setup_done,
  }});
});

sessionRoutes.get("/status", (c) => {
  const origin = originFromRequest(c.req.url);
  return c.json({
    googleEnabled: googleConfigured(c),
    naverEnabled: naverConfigured(c),
    origin,
    googleCallback: `${origin}/api/auth/google/callback`,
    naverCallback: `${origin}/api/auth/naver/callback`,
  });
});

sessionRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});



export default sessionRoutes;
