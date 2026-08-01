export type Bindings = {
  DB: D1Database;
  ADMIN_TOKEN: string;
  ASSETS: Fetcher;
};

export type SongRow = {
  id: string;
  title: string;
  artist: string;
  category: string;
  tags: string;
  song_key: string | null;
  bpm: number | null;
  enabled: number;
  created_at: number;
  updated_at: number;
};

export type RequestRow = {
  id: string;
  song_id: string | null;
  title: string;
  artist: string;
  nickname: string;
  comment: string;
  status: string;
  created_at: number;
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  category: string;
  tags: string[];
  songKey: string | null;
  bpm: number | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SongRequest = {
  id: string;
  songId: string | null;
  title: string;
  artist: string;
  nickname: string;
  comment: string;
  status: string;
  createdAt: number;
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
    category: row.category,
    tags,
    songKey: row.song_key,
    bpm: row.bpm,
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
  };
}
