import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { prefersMarkdown, preferredType } from "../src/worker/accept";

function workerFetch(): {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  return exports.default as {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
}

async function fetchPath(path: string, init: RequestInit = {}): Promise<Response> {
  return workerFetch().fetch(`http://example.com${path}`, init);
}

describe("preferredType", () => {
  it("defaults to HTML when Accept is missing", () => {
    expect(preferredType(undefined, ["text/html", "text/markdown"])).toBe("text/html");
    expect(prefersMarkdown(undefined)).toBe(false);
  });

  it("selects markdown when Accept is text/markdown", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html")).toBe(true);
  });

  it("keeps HTML for typical browser Accept values", () => {
    expect(
      prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    ).toBe(false);
    expect(prefersMarkdown("text/html, text/markdown")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
  });

  it("ignores markdown when q=0", () => {
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0, text/html")).toBe(false);
  });
});

describe("markdown content negotiation", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM requests WHERE channel_id LIKE 'ch-md-%'").run();
    await env.DB.prepare("DELETE FROM songs WHERE channel_id LIKE 'ch-md-%'").run();
    await env.DB.prepare("DELETE FROM settings WHERE channel_id LIKE 'ch-md-%'").run();
    await env.DB.prepare("DELETE FROM channels WHERE id LIKE 'ch-md-%'").run();
  });

  it("does not convert JSON API responses", async () => {
    const res = await fetchPath("/api/health", {
      headers: { Accept: "text/markdown" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns markdown for the home page", async () => {
    await env.DB.prepare(
      `INSERT INTO channels (id, slug, name, admin_token_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("ch-md-alpha", "md-alpha", "알파 노래책", "hash", Date.now())
      .run();
    await env.DB.prepare(
      `INSERT INTO songs (id, channel_id, title, artist, category, tags, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '[]', 1, ?, ?)`,
    )
      .bind("song-md-a", "ch-md-alpha", "테스트곡", "가수", "KPOP", Date.now(), Date.now())
      .run();

    const res = await fetchPath("/", { headers: { Accept: "text/markdown" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    expect(res.headers.get("vary")?.toLowerCase()).toContain("accept");
    expect(res.headers.get("x-markdown-tokens")).toMatch(/^[1-9]\d*$/);

    const body = await res.text();
    expect(body).toContain("title: Live MR Songbook");
    expect(body).toContain("라이브 방송용 신청 노래책");
    expect(body).toContain("스트리머가 공유한 노래책에서 원하는 곡을 신청하세요");
    expect(body).toContain("# 방송 중, 바로 신청");
    expect(body).toContain("알파 노래책");
    expect(body).toContain("/c/md-alpha");
    expect(body).toContain("1곡");
  });

  it("returns a channel songbook as markdown", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO channels (id, slug, name, admin_token_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("ch-md-beta", "md-beta", "베타", "hash", now)
      .run();
    await env.DB.prepare(
      `INSERT INTO settings (channel_id, key, value) VALUES (?, 'accepting_requests', 'true')`,
    )
      .bind("ch-md-beta")
      .run();
    await env.DB.prepare(
      `INSERT INTO songs (id, channel_id, title, artist, category, genre, tags, song_key, bpm, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, 1, ?, ?)`,
    )
      .bind("song-md-b", "ch-md-beta", "밤양갱", "비비", "KPOP", "K-POP", "F#m", 100, now, now)
      .run();
    await env.DB.prepare(
      `INSERT INTO songs (id, channel_id, title, artist, category, tags, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '[]', 0, ?, ?)`,
    )
      .bind("song-md-disabled", "ch-md-beta", "숨은곡", "숨김", "KPOP", now, now)
      .run();

    const res = await fetchPath("/c/md-beta", { headers: { Accept: "text/markdown" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    const body = await res.text();
    expect(body).toContain("# 베타");
    expect(body).toContain("신청: 가능");
    expect(body).toContain("밤양갱");
    expect(body).toContain("비비");
    expect(body).not.toContain("숨은곡");
  });

  it("returns 404 markdown for an unknown channel", async () => {
    const res = await fetchPath("/c/missing", { headers: { Accept: "text/markdown" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    expect(await res.text()).toContain("노래책을 찾을 수 없습니다");
  });

  it("hides the demo channel from the home listing", async () => {
    await env.DB.prepare(
      `INSERT INTO channels (id, slug, name, admin_token_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("ch-md-demo", "demo", "Demo Songbook", "hash", Date.now())
      .run();

    const res = await fetchPath("/", { headers: { Accept: "text/markdown" } });
    const body = await res.text();
    expect(body).not.toContain("Demo Songbook");
    expect(body).not.toContain("/c/demo");
  });
});
