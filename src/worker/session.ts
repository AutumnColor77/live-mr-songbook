import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { bearerToken, sha256Hex } from "./crypto";
import { newId } from "./id";
import { clampNickname } from "./limits";
import type { AppEnv, AuthUser, UserRow } from "./types";

export const SESSION_COOKIE = "sb_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const OAUTH_STATE_COOKIE = "sb_oauth_state";

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    needsProfileSetup: !row.profile_setup_done,
  };
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isSecureRequest(c: Context<AppEnv>): boolean {
  const url = new URL(c.req.url);
  return url.protocol === "https:";
}

export function setOAuthStateCookie(c: Context<AppEnv>, state: string): void {
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function createSessionToken(db: D1Database, userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(newId("ses"), userId, tokenHash, expiresAt, now)
    .run();

  return token;
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<string> {
  const token = await createSessionToken(c.env.DB, userId);

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return token;
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = bearerToken(c.req.header("Authorization")) || getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function loadUserFromSession(c: Context<AppEnv>): Promise<AuthUser | null> {
  const token = bearerToken(c.req.header("Authorization")) || getCookie(c, SESSION_COOKIE) || "";
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const now = Date.now();

  const row = await c.env.DB.prepare(
    `SELECT u.id, u.google_sub, u.email, u.name, u.picture, u.profile_setup_done, u.created_at, u.updated_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, now)
    .first<UserRow>();

  if (!row) {
    if (getCookie(c, SESSION_COOKIE)) {
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
    }
    return null;
  }

  return mapUser(row);
}

export async function upsertOAuthUser(
  db: D1Database,
  profile: {
    provider: "google" | "naver";
    sub: string;
    email: string;
    name: string;
    picture: string;
  },
): Promise<{ user: UserRow; created: boolean }> {
  const now = Date.now();
  const existing =
    (await db
      .prepare("SELECT * FROM users WHERE provider = ? AND provider_sub = ?")
      .bind(profile.provider, profile.sub)
      .first<UserRow>()) ??
    (profile.provider === "google"
      ? await db
          .prepare("SELECT * FROM users WHERE google_sub = ?")
          .bind(profile.sub)
          .first<UserRow>()
      : null);

  if (existing) {
    const setupDone = Boolean(existing.profile_setup_done);
    const name = setupDone
      ? existing.name
      : clampNickname(profile.name, existing.name || "User");
    const picture = setupDone ? existing.picture : profile.picture;
    const googleSub =
      profile.provider === "google" ? profile.sub : existing.google_sub || `naver:${profile.sub}`;

    await db
      .prepare(
        `UPDATE users
         SET email = ?, name = ?, picture = ?, updated_at = ?,
             provider = ?, provider_sub = ?, google_sub = ?
         WHERE id = ?`,
      )
      .bind(
        profile.email,
        name,
        picture,
        now,
        profile.provider,
        profile.sub,
        googleSub,
        existing.id,
      )
      .run();

    return {
      created: false,
      user: {
        ...existing,
        email: profile.email,
        name,
        picture,
        provider: profile.provider,
        provider_sub: profile.sub,
        google_sub: googleSub,
        updated_at: now,
      },
    };
  }

  const id = newId("usr");
  const googleSub =
    profile.provider === "google" ? profile.sub : `naver:${profile.sub}`;
  const name = clampNickname(profile.name, "User");
  await db
    .prepare(
      `INSERT INTO users (id, google_sub, provider, provider_sub, email, name, picture, profile_setup_done, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      id,
      googleSub,
      profile.provider,
      profile.sub,
      profile.email,
      name,
      profile.picture,
      now,
      now,
    )
    .run();

  return {
    created: true,
    user: {
      id,
      google_sub: googleSub,
      provider: profile.provider,
      provider_sub: profile.sub,
      email: profile.email,
      name,
      picture: profile.picture,
      profile_setup_done: 0,
      created_at: now,
      updated_at: now,
    },
  };
}

export async function updateUserProfile(
  db: D1Database,
  userId: string,
  input: { name: string; picture: string },
): Promise<UserRow | null> {
  const now = Date.now();
  const name = clampNickname(input.name);
  if (!name) return null;

  const picture = input.picture.trim();
  if (picture.length > 200_000) return null;
  if (
    picture &&
    !/^https?:\/\//i.test(picture) &&
    !picture.startsWith("data:image/")
  ) {
    return null;
  }

  await db
    .prepare(
      `UPDATE users
       SET name = ?, picture = ?, profile_setup_done = 1, updated_at = ?
       WHERE id = ?`,
    )
    .bind(name, picture, now, userId)
    .run();

  return db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<UserRow>();
}
