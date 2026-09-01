import { env, exports } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/worker/crypto";
import { SONG_THUMBNAIL_MAX_DATA_URL_CHARS } from "../src/worker/types";

const SLUG = "synctest";
const TOKEN = "test-admin-token-16";
const CHANNEL_ID = "ch-synctest";

type SyncResponse = {
  added: number;
  updated: number;
  skipped: number;
  disabled: number;
  failed: number;
  errors: Array<{ index: number; title: string; artist: string; message: string }>;
};

type SongFixture = {
  title: string;
  artist: string;
  category?: string;
  genre?: string;
  tags?: string[];
  songKey?: string | null;
  bpm?: number | null;
  difficulty?: number | null;
  donationAmount?: number | null;
  thumbnail?: string;
  originalUrl?: string | null;
  enabled?: boolean;
};

function workerFetch(): {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  return exports.default as {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return workerFetch().fetch(`http://example.com${path}`, { ...init, headers });
}

async function authApi(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${TOKEN}`);
  return api(path, { ...init, headers });
}

function makeSongs(count: number, override?: Partial<SongFixture>): SongFixture[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Song ${i}`,
    artist: `Artist ${i}`,
    category: "인기",
    genre: "K-POP",
    tags: ["신나는"],
    songKey: "C",
    bpm: 120,
    difficulty: 3,
    donationAmount: null,
    thumbnail: "",
    originalUrl: null,
    enabled: true,
    ...override,
  }));
}

describe("PUT /api/c/:slug/admin/songs/sync", () => {
  beforeAll(async () => {
    const hash = await sha256Hex(TOKEN);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO channels (id, slug, name, admin_token_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(CHANNEL_ID, SLUG, "Sync Test", hash, Date.now())
      .run();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM songs WHERE channel_id = ?").bind(CHANNEL_ID).run();
  });

  it("adds 100 songs to an empty channel", async () => {
    const res = await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({ songs: makeSongs(100) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncResponse;
    expect(body).toMatchObject({
      added: 100,
      updated: 0,
      skipped: 0,
      disabled: 0,
      failed: 0,
    });
    expect(body.errors).toEqual([]);

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM songs WHERE channel_id = ?",
    )
      .bind(CHANNEL_ID)
      .first<{ n: number }>();
    expect(count?.n).toBe(100);
  });

  it("skips the same 100 songs on resend", async () => {
    const songs = makeSongs(100);
    await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({ songs }),
    });
    const res = await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({ songs }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncResponse;
    expect(body).toMatchObject({
      added: 0,
      updated: 0,
      skipped: 100,
      disabled: 0,
      failed: 0,
    });
  });

  it("updates one song when a non-key field changes", async () => {
    const songs = makeSongs(100);
    await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({ songs }),
    });
    songs[7] = { ...songs[7]!, bpm: 99 };
    const res = await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({ songs }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncResponse;
    expect(body).toMatchObject({
      added: 0,
      updated: 1,
      skipped: 99,
      failed: 0,
    });
  });

  it("soft-disables remote songs missing from the payload", async () => {
    await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({ songs: makeSongs(5) }),
    });
    const res = await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({
        songs: makeSongs(2),
        disableMissing: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncResponse;
    expect(body).toMatchObject({
      added: 0,
      updated: 0,
      skipped: 2,
      disabled: 3,
      failed: 0,
    });
    const disabled = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM songs WHERE channel_id = ? AND enabled = 0",
    )
      .bind(CHANNEL_ID)
      .first<{ n: number }>();
    expect(disabled?.n).toBe(3);
  });

  it("fails a data URL thumbnail over 80_000 chars", async () => {
    const oversized = `data:image/jpeg;base64,${"A".repeat(SONG_THUMBNAIL_MAX_DATA_URL_CHARS)}`;
    expect(oversized.length).toBeGreaterThan(SONG_THUMBNAIL_MAX_DATA_URL_CHARS);
    const res = await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({
        songs: [
          {
            title: "Big Thumb",
            artist: "Test",
            thumbnail: oversized,
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncResponse;
    expect(body.failed).toBe(1);
    expect(body.added).toBe(0);
    expect(body.errors[0]).toMatchObject({
      index: 0,
      title: "Big Thumb",
      artist: "Test",
      message: "thumbnail too large",
    });
  });

  it("rejects non-http originalUrl", async () => {
    const res = await authApi(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({
        songs: [
          {
            title: "Local File",
            artist: "Test",
            originalUrl: "C:\\music\\a.mp3",
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncResponse;
    expect(body.failed).toBe(1);
    expect(body.errors[0]).toMatchObject({
      index: 0,
      message: "invalid originalUrl",
    });
  });

  it("returns 401 Unauthorized without a bearer token", async () => {
    const res = await api(`/api/c/${SLUG}/admin/songs/sync`, {
      method: "PUT",
      body: JSON.stringify({ songs: [] }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("does not change single-song POST behavior", async () => {
    const res = await authApi(`/api/c/${SLUG}/admin/songs`, {
      method: "POST",
      body: JSON.stringify({ title: "Solo", artist: "One" }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { song: { title: string; artist: string } };
    expect(created.song).toMatchObject({ title: "Solo", artist: "One" });

    const list = await authApi(`/api/c/${SLUG}/admin/songs`);
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { songs: Array<{ title: string }> };
    expect(listed.songs.some((song) => song.title === "Solo")).toBe(true);
  });
});
