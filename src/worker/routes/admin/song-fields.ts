import { thumbPublicPath } from "../../thumbnails";
import {
  normalizeDonationAmount,
  normalizeOriginalUrl,
  SONG_THUMBNAIL_MAX_DATA_URL_CHARS,
  type SongRow,
} from "../../types";
import { normalizeCategory, normalizeDifficulty, normalizeGenre } from "./normalize";

export type SongPayload = {
  title?: unknown;
  artist?: unknown;
  category?: unknown;
  genre?: unknown;
  tags?: unknown;
  songKey?: unknown;
  bpm?: unknown;
  difficulty?: unknown;
  donationAmount?: unknown;
  thumbnail?: unknown;
  originalUrl?: unknown;
  enabled?: unknown;
};

export type SongWriteFields = {
  title: string;
  artist: string;
  category: string;
  genre: string;
  tagsJson: string;
  songKey: string | null;
  bpm: number | null;
  difficulty: number | null;
  donationAmount: number | null;
  originalUrl: string | null;
  enabled: number;
};

export const INSERT_SONG_SQL = `INSERT INTO songs (id, channel_id, title, artist, category, genre, tags, song_key, bpm, difficulty, donation_amount, thumbnail, original_url, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const UPDATE_SONG_SQL = `UPDATE songs SET title = ?, artist = ?, category = ?, genre = ?, tags = ?, song_key = ?, bpm = ?, difficulty = ?, donation_amount = ?, thumbnail = ?, original_url = ?, enabled = ?, updated_at = ?
     WHERE id = ? AND channel_id = ?`;

export function tagsToJson(tags: unknown): string {
  return Array.isArray(tags) ? JSON.stringify(tags.map(String)) : "[]";
}

export function fieldsFromPostPayload(
  body: SongPayload,
  title: string,
  artist: string,
  enabled: number,
): SongWriteFields {
  return {
    title,
    artist,
    category: normalizeCategory(body.category),
    genre: normalizeGenre(body.genre),
    tagsJson: tagsToJson(body.tags),
    songKey: (body.songKey ?? null) as string | null,
    bpm: (body.bpm ?? null) as number | null,
    difficulty: normalizeDifficulty(body.difficulty),
    donationAmount: normalizeDonationAmount(body.donationAmount),
    originalUrl: normalizeOriginalUrl(body.originalUrl),
    enabled,
  };
}

export function mergePatchSongFields(
  existing: SongRow,
  body: Partial<{
    title: string;
    artist: string;
    category: string;
    genre: string;
    tags: string[];
    songKey: string | null;
    bpm: number | null;
    difficulty: number | null;
    donationAmount: number | null;
    originalUrl: string | null;
    enabled: boolean;
  }>,
): SongWriteFields {
  return {
    title: body.title !== undefined ? String(body.title).trim() : existing.title,
    artist: body.artist !== undefined ? String(body.artist).trim() : existing.artist,
    category:
      body.category !== undefined
        ? normalizeCategory(body.category, existing.category || "")
        : existing.category,
    genre:
      body.genre !== undefined
        ? normalizeGenre(body.genre, existing.genre || "미분류")
        : (existing.genre ?? ""),
    tagsJson:
      body.tags !== undefined ? JSON.stringify(body.tags.map(String)) : existing.tags,
    songKey: body.songKey !== undefined ? body.songKey : existing.song_key,
    bpm: body.bpm !== undefined ? body.bpm : existing.bpm,
    difficulty:
      body.difficulty !== undefined
        ? normalizeDifficulty(body.difficulty)
        : (existing.difficulty ?? null),
    donationAmount:
      body.donationAmount !== undefined
        ? normalizeDonationAmount(body.donationAmount)
        : (existing.donation_amount ?? null),
    originalUrl:
      body.originalUrl !== undefined
        ? normalizeOriginalUrl(body.originalUrl)
        : (existing.original_url ?? null),
    enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
  };
}

export function songInsertBinds(
  id: string,
  channelId: string,
  fields: SongWriteFields,
  thumbnail: string,
  now: number,
): unknown[] {
  return [
    id,
    channelId,
    fields.title,
    fields.artist,
    fields.category,
    fields.genre,
    fields.tagsJson,
    fields.songKey,
    fields.bpm,
    fields.difficulty,
    fields.donationAmount,
    thumbnail,
    fields.originalUrl,
    fields.enabled,
    now,
    now,
  ];
}

export function songUpdateBinds(
  fields: SongWriteFields,
  thumbnail: string,
  updatedAt: number,
  id: string,
  channelId: string,
): unknown[] {
  return [
    fields.title,
    fields.artist,
    fields.category,
    fields.genre,
    fields.tagsJson,
    fields.songKey,
    fields.bpm,
    fields.difficulty,
    fields.donationAmount,
    thumbnail,
    fields.originalUrl,
    fields.enabled,
    updatedAt,
    id,
    channelId,
  ];
}

export function isOversizedDataUrlThumbnail(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const value = raw.trim();
  return (
    value.startsWith("data:image/") && value.length > SONG_THUMBNAIL_MAX_DATA_URL_CHARS
  );
}

export function hasRejectedOriginalUrl(raw: unknown): boolean {
  if (raw == null || raw === "") return false;
  if (typeof raw !== "string") return true;
  if (!raw.trim()) return false;
  return normalizeOriginalUrl(raw) == null;
}

function parseTags(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function tagsEqual(a: string, b: string): boolean {
  const left = parseTags(a);
  const right = parseTags(b);
  return left.length === right.length && left.every((item, i) => item === right[i]);
}

export function songWriteFieldsEqual(existing: SongRow, fields: SongWriteFields): boolean {
  return (
    existing.title === fields.title &&
    existing.artist === fields.artist &&
    existing.category === fields.category &&
    (existing.genre ?? "") === fields.genre &&
    tagsEqual(existing.tags, fields.tagsJson) &&
    existing.song_key == fields.songKey &&
    existing.bpm == fields.bpm &&
    (existing.difficulty ?? null) == fields.difficulty &&
    (existing.donation_amount ?? null) == fields.donationAmount &&
    (existing.original_url ?? null) == fields.originalUrl &&
    existing.enabled === fields.enabled
  );
}

export function thumbnailsEquivalent(
  payloadThumb: unknown,
  existingThumb: string,
  channelId: string,
  songId: string,
): boolean {
  const raw = typeof payloadThumb === "string" ? payloadThumb.trim() : "";
  const existing = existingThumb ?? "";
  if (raw === existing) return true;
  if (!raw && !existing) return true;
  if (raw.startsWith("data:image/") && existing === thumbPublicPath(channelId, songId)) {
    return true;
  }
  return false;
}
