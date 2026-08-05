export type Bindings = {
  DB: D1Database;
  PLATFORM_ADMIN_TOKEN: string;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  NAVER_CLIENT_ID?: string;
  NAVER_CLIENT_SECRET?: string;
};

export type ChannelRow = {
  id: string;
  slug: string;
  name: string;
  admin_token_hash: string;
  created_at: number;
};

export type UserRow = {
  id: string;
  google_sub: string;
  provider?: string;
  provider_sub?: string | null;
  email: string;
  name: string;
  picture: string;
  profile_setup_done?: number;
  created_at: number;
  updated_at: number;
};

export type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string;
  needsProfileSetup: boolean;
};

export type Variables = {
  channel: ChannelRow;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export type SongRow = {
  id: string;
  channel_id: string;
  title: string;
  artist: string;
  category: string;
  genre: string;
  tags: string;
  song_key: string | null;
  bpm: number | null;
  difficulty: number | null;
  thumbnail: string;
  enabled: number;
  created_at: number;
  updated_at: number;
};

export type RequestRow = {
  id: string;
  channel_id: string;
  song_id: string | null;
  title: string;
  artist: string;
  nickname: string;
  comment: string;
  status: string;
  created_at: number;
  sort_order: number;
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  category: string;
  genre: string;
  tags: string[];
  songKey: string | null;
  bpm: number | null;
  difficulty: number | null;
  thumbnail: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

/** Max JPEG data-URL length from Manager prepareSongbookThumbnail (~80KB text). */
export const SONG_THUMBNAIL_MAX_DATA_URL_CHARS = 80_000;
const MAX_HTTP_THUMBNAIL_CHARS = 2048;

/** http(s) URL or compact data:image/*; local paths rejected */
export function normalizeThumbnail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value) return "";

  if (value.startsWith("data:image/")) {
    if (value.length > SONG_THUMBNAIL_MAX_DATA_URL_CHARS) return "";
    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value)) return "";
    return value;
  }

  if (value.length > MAX_HTTP_THUMBNAIL_CHARS) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return value;
  } catch {
    return "";
  }
}

export type SongRequest = {
  id: string;
  songId: string | null;
  title: string;
  artist: string;
  nickname: string;
  comment: string;
  status: string;
  createdAt: number;
  sortOrder: number;
};

export function mapSong(row: SongRow): Song {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
    if (!Array.isArray(tags)) tags = [];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    category: row.category ?? "",
    genre: row.genre ?? "",
    tags,
    songKey: row.song_key,
    bpm: row.bpm,
    difficulty:
      typeof row.difficulty === "number" && row.difficulty >= 1 && row.difficulty <= 5
        ? row.difficulty
        : null,
    thumbnail: row.thumbnail ?? "",
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRequest(row: RequestRow): SongRequest {
  return {
    id: row.id,
    songId: row.song_id,
    title: row.title,
    artist: row.artist,
    nickname: row.nickname,
    comment: row.comment,
    status: row.status,
    createdAt: row.created_at,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : row.created_at,
  };
}
