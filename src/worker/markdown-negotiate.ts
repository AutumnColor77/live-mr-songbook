import type { Context, MiddlewareHandler, Next } from "hono";
import { appendVaryAccept, prefersMarkdown } from "./accept";
import { SLUG_RE } from "./crypto";
import type { AppEnv, ChannelRow } from "./types";

const SITE_TITLE = "Live MR Songbook — 라이브 방송용 신청 노래책";
const SITE_DESCRIPTION =
  "스트리머가 공유한 노래책에서 원하는 곡을 신청하세요. 시청자는 스트리머의 곡 목록에서 방송 중 원하는 곡을 바로 신청할 수 있습니다.";
const LMRM_URL = "https://github.com/AutumnColor77/Live-MR-Manager/releases";

const STATIC_EXT =
  /\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|eot|xml|txt|json|webmanifest|pdf|mp4|webm|mp3|wav|ogg|zip)$/i;

type DirectoryChannel = { slug: string; name: string; song_count: number };

type SongListRow = {
  title: string;
  artist: string;
  genre: string;
  category: string;
  song_key: string | null;
  bpm: number | null;
};

type Page =
  | { kind: "home" }
  | { kind: "songbook"; slug: string }
  | { kind: "admin"; slug: string }
  | { kind: "account" }
  | { kind: "setup" }
  | { kind: "invalid-slug" };

function isDocumentPath(path: string): boolean {
  if (path.startsWith("/api/")) return false;
  if (path === "/sitemap.xml") return false;
  if (STATIC_EXT.test(path)) return false;
  return true;
}

function parsePage(path: string): Page | null {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/") return { kind: "home" };
  if (clean === "/me") return { kind: "account" };
  if (clean === "/me/setup") return { kind: "setup" };

  const channel = /^\/c\/([^/]+)(?:\/(admin))?$/.exec(clean);
  if (!channel) return null;
  const slug = channel[1]!.toLowerCase();
  if (!SLUG_RE.test(slug)) return { kind: "invalid-slug" };
  if (channel[2] === "admin") return { kind: "admin", slug };
  return { kind: "songbook", slug };
}

function yamlScalar(value: string): string {
  if (
    value === "" ||
    /[:#{}[\],&*?|<>=!%@`'"]/.test(value) ||
    /^\s|\s$/.test(value) ||
    value.includes("\n")
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function frontmatter(fields: Record<string, string | undefined>): string {
  const lines = Object.entries(fields)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}: ${yamlScalar(value)}`);
  if (lines.length === 0) return "";
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function mdCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function markdownResponse(
  body: string,
  status = 200,
  cacheControl = "public, max-age=60",
): Response {
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": cacheControl,
    "x-markdown-tokens": String(estimateTokens(body)),
  });
  appendVaryAccept(headers);
  return new Response(body, { status, headers });
}

async function loadChannel(
  db: D1Database,
  slug: string,
): Promise<ChannelRow | null> {
  return db.prepare("SELECT * FROM channels WHERE slug = ?").bind(slug).first<ChannelRow>();
}

async function homeMarkdown(origin: string, db: D1Database): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT
         c.slug AS slug,
         c.name AS name,
         COALESCE(COUNT(s.id), 0) AS song_count
       FROM channels c
       LEFT JOIN songs s
         ON s.channel_id = c.id AND s.enabled = 1
       WHERE c.slug != 'demo'
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE ASC`,
    )
    .all<DirectoryChannel>();

  const channels = results ?? [];
  const channelList =
    channels.length === 0
      ? "등록된 공개 노래책이 없습니다. 스트리머가 공유한 `/c/{slug}` 주소로 바로 신청할 수 있습니다."
      : channels
          .map(
            (ch) =>
              `- [${mdCell(ch.name)}](${origin}/c/${ch.slug}) — ${Number(ch.song_count) || 0}곡 (\`/c/${ch.slug}\`)`,
          )
          .join("\n");

  return (
    frontmatter({
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      image: `${origin}/icon-512.png`,
    }) +
    `# 방송 중, 바로 신청

스트리머가 공유한 노래책에서 원하는 곡을 신청하세요.

스트리머가 공유한 노래책 주소로 바로 신청할 수 있어요.

라이브 MR을 다루는 [Live MR Manager (LMRM)](${LMRM_URL})도 사용해보세요.

## 공개 노래책

${channelList}
`
  );
}

async function songbookMarkdown(
  origin: string,
  db: D1Database,
  slug: string,
): Promise<Response> {
  const channel = await loadChannel(db, slug);
  if (!channel) {
    return markdownResponse(
      frontmatter({
        title: "노래책을 찾을 수 없습니다",
        description: "존재하지 않는 채널입니다.",
      }) +
        `# 노래책을 찾을 수 없습니다

\`${slug}\` 채널은 없습니다. [홈](${origin}/)에서 공개 노래책을 확인하세요.
`,
      404,
      "public, max-age=30",
    );
  }

  const [songsResult, acceptingRow, nowPlayingIdRow, pendingRow] = await Promise.all([
    db
      .prepare(
        `SELECT title, artist, genre, category, song_key, bpm
         FROM songs
         WHERE channel_id = ? AND enabled = 1
         ORDER BY title COLLATE NOCASE ASC`,
      )
      .bind(channel.id)
      .all<SongListRow>(),
    db
      .prepare("SELECT value FROM settings WHERE channel_id = ? AND key = 'accepting_requests'")
      .bind(channel.id)
      .first<{ value: string }>(),
    db
      .prepare("SELECT value FROM settings WHERE channel_id = ? AND key = 'now_playing_id'")
      .bind(channel.id)
      .first<{ value: string }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM requests WHERE channel_id = ? AND status = 'pending'",
      )
      .bind(channel.id)
      .first<{ count: number }>(),
  ]);

  const songs = songsResult.results ?? [];
  const accepting = (acceptingRow?.value ?? "true") === "true";
  const pendingCount = Number(pendingRow?.count) || 0;

  let nowPlayingLine = "없음";
  const nowPlayingId = nowPlayingIdRow?.value ?? "";
  if (nowPlayingId) {
    const playing = await db
      .prepare("SELECT title, artist FROM requests WHERE id = ? AND channel_id = ?")
      .bind(nowPlayingId, channel.id)
      .first<{ title: string; artist: string }>();
    if (playing) {
      nowPlayingLine = `${playing.title} — ${playing.artist}`;
    }
  }
  if (nowPlayingLine === "없음") {
    const playing = await db
      .prepare(
        `SELECT title, artist FROM requests
         WHERE channel_id = ? AND status = 'playing'
         ORDER BY created_at ASC LIMIT 1`,
      )
      .bind(channel.id)
      .first<{ title: string; artist: string }>();
    if (playing) {
      nowPlayingLine = `${playing.title} — ${playing.artist}`;
    }
  }

  const songTable =
    songs.length === 0
      ? "등록된 곡이 없습니다."
      : [
          "| 제목 | 아티스트 | 장르 | 키 | BPM |",
          "| --- | --- | --- | --- | --- |",
          ...songs.map((song) => {
            const genre = (song.genre || song.category || "").trim();
            return `| ${mdCell(song.title)} | ${mdCell(song.artist)} | ${mdCell(genre)} | ${mdCell(song.song_key ?? "")} | ${song.bpm ?? ""} |`;
          }),
        ].join("\n");

  const body =
    frontmatter({
      title: `${channel.name} — Live MR Songbook`,
      description: `${channel.name} 노래책에서 원하는 곡을 신청하세요.`,
    }) +
    `# ${channel.name}

- 주소: ${origin}/c/${channel.slug}
- 신청: ${accepting ? "가능" : "마감"}
- 등록곡: ${songs.length}곡
- 대기: ${pendingCount}건
- 현재 곡: ${nowPlayingLine}

브라우저에서 곡을 고른 뒤 닉네임과 함께 신청하거나, 치지직 채팅에서 \`!신청 제목-가수\` 명령을 사용할 수 있습니다.

## 곡 목록

${songTable}
`;

  return markdownResponse(body);
}

function invalidSlugMarkdown(origin: string): Response {
  return markdownResponse(
    frontmatter({
      title: "잘못된 채널 주소",
      description: "주소를 확인해 주세요.",
    }) +
      `# 잘못된 채널 주소

채널 주소 형식이 올바르지 않습니다. [홈](${origin}/)으로 돌아가 주세요.
`,
    400,
    "public, max-age=300",
  );
}

async function adminMarkdown(origin: string, db: D1Database, slug: string): Promise<Response> {
  const channel = await loadChannel(db, slug);
  if (!channel) {
    return songbookMarkdown(origin, db, slug);
  }
  const body =
    frontmatter({
      title: `운영 · ${channel.name}`,
      description: `${channel.name} 채널 운영 페이지입니다. 로그인이 필요합니다.`,
    }) +
    `# ${channel.name} 운영

이 페이지는 채널 관리자용이며 브라우저에서 로그인한 뒤 이용할 수 있습니다.

공개 노래책: [${channel.name}](${origin}/c/${channel.slug})
`;
  return markdownResponse(body, 200, "public, max-age=120");
}

function accountMarkdown(origin: string): Response {
  return markdownResponse(
    frontmatter({
      title: "내 계정 · Live MR Songbook",
      description: "로그인하면 계정과 내 노래책을 관리할 수 있습니다.",
    }) +
      `# 내 계정

이 페이지는 로그인한 사용자 전용입니다. 브라우저에서 로그인한 뒤 이용하세요.

공개 노래책은 [홈](${origin}/) 또는 스트리머가 공유한 \`/c/{slug}\` 주소에서 볼 수 있습니다.
`,
    200,
    "public, max-age=120",
  );
}

function setupMarkdown(origin: string): Response {
  return markdownResponse(
    frontmatter({
      title: "프로필 설정 · Live MR Songbook",
      description: "처음 로그인하면 프로필을 설정합니다.",
    }) +
      `# 프로필 설정

이 페이지는 로그인한 사용자 전용입니다. 브라우저에서 로그인한 뒤 프로필을 완성하세요.

[홈으로](${origin}/)
`,
    200,
    "public, max-age=120",
  );
}

async function renderMarkdown(c: Context<AppEnv>): Promise<Response> {
  const origin = new URL(c.req.url).origin;
  const page = parsePage(c.req.path);
  if (!page) {
    return markdownResponse(
      frontmatter({
        title: "페이지를 찾을 수 없습니다",
        description: SITE_DESCRIPTION,
      }) +
        `# 페이지를 찾을 수 없습니다

[홈](${origin}/)으로 돌아가 주세요.
`,
      404,
      "public, max-age=60",
    );
  }

  switch (page.kind) {
    case "home":
      return markdownResponse(await homeMarkdown(origin, c.env.DB), 200, "public, max-age=300");
    case "songbook":
      return songbookMarkdown(origin, c.env.DB, page.slug);
    case "admin":
      return adminMarkdown(origin, c.env.DB, page.slug);
    case "account":
      return accountMarkdown(origin);
    case "setup":
      return setupMarkdown(origin);
    case "invalid-slug":
      return invalidSlugMarkdown(origin);
  }
}

export const markdownNegotiate: MiddlewareHandler<AppEnv> = async (c, next: Next) => {
  if ((c.req.method !== "GET" && c.req.method !== "HEAD") || !isDocumentPath(c.req.path)) {
    await next();
    return;
  }

  if (prefersMarkdown(c.req.header("Accept"))) {
    return renderMarkdown(c);
  }

  await next();
  appendVaryAccept(c.res.headers);
};
