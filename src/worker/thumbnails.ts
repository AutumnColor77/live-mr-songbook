/** Song thumbnail storage in KV (R2 fallback when account enables it later). */

import {
  normalizeThumbnail,
  SONG_THUMBNAIL_MAX_DATA_URL_CHARS,
  type Bindings,
} from "./types";

export function thumbKvKey(channelId: string, songId: string): string {
  return `thumb:${channelId}:${songId}`;
}

export function thumbPublicPath(channelId: string, songId: string): string {
  return `/api/media/thumbs/${encodeURIComponent(channelId)}/${encodeURIComponent(songId)}`;
}

export function isManagedThumbPath(value: string): boolean {
  return value.startsWith("/api/media/thumbs/");
}

function parseDataUrl(
  dataUrl: string,
): { contentType: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m?.[1] || !m[2]) return null;
  if (dataUrl.length > SONG_THUMBNAIL_MAX_DATA_URL_CHARS) return null;
  try {
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { contentType: m[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

/** Normalize input; data URLs are uploaded to KV when available. */
export async function persistThumbnail(
  env: Bindings,
  channelId: string,
  songId: string,
  raw: unknown,
  previous?: string,
): Promise<string> {
  const normalized = normalizeThumbnail(raw);
  if (!normalized) {
    if (previous && isManagedThumbPath(previous) && env.THUMB_KV) {
      await env.THUMB_KV.delete(thumbKvKey(channelId, songId)).catch(() => undefined);
    }
    return "";
  }

  if (!normalized.startsWith("data:image/")) {
    // External http(s) URL — drop any previous managed blob.
    if (previous && isManagedThumbPath(previous) && env.THUMB_KV) {
      await env.THUMB_KV.delete(thumbKvKey(channelId, songId)).catch(() => undefined);
    }
    return normalized;
  }

  if (!env.THUMB_KV) {
    return normalized;
  }

  const parsed = parseDataUrl(normalized);
  if (!parsed) return "";

  try {
    await env.THUMB_KV.put(thumbKvKey(channelId, songId), parsed.bytes, {
      metadata: { contentType: parsed.contentType },
    });
    return thumbPublicPath(channelId, songId);
  } catch (err) {
    console.error("[thumbnails] KV put failed", err);
    return normalized;
  }
}

export async function deleteThumbnailBlob(
  env: Bindings,
  channelId: string,
  songId: string,
  thumbnail: string,
): Promise<void> {
  if (!env.THUMB_KV || !isManagedThumbPath(thumbnail)) return;
  await env.THUMB_KV.delete(thumbKvKey(channelId, songId)).catch(() => undefined);
}

export async function readThumbnailBlob(
  env: Bindings,
  channelId: string,
  songId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!env.THUMB_KV) return null;
  const result = await env.THUMB_KV.getWithMetadata<{ contentType?: string }>(
    thumbKvKey(channelId, songId),
    "arrayBuffer",
  );
  if (!result.value) return null;
  const contentType =
    typeof result.metadata?.contentType === "string" && result.metadata.contentType
      ? result.metadata.contentType
      : "image/jpeg";
  return { bytes: result.value, contentType };
}

/** Move legacy D1 data-URL thumbnails into KV (batch). */
export async function migrateDataUrlThumbnails(
  env: Bindings,
  limit = 40,
): Promise<number> {
  if (!env.THUMB_KV) return 0;
  const { results } = await env.DB.prepare(
    `SELECT id, channel_id, thumbnail FROM songs
     WHERE thumbnail LIKE 'data:image/%'
     LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: string; channel_id: string; thumbnail: string }>();

  let migrated = 0;
  for (const row of results ?? []) {
    const next = await persistThumbnail(
      env,
      row.channel_id,
      row.id,
      row.thumbnail,
      row.thumbnail,
    );
    if (!next || next.startsWith("data:")) continue;
    await env.DB.prepare(
      "UPDATE songs SET thumbnail = ?, updated_at = ? WHERE id = ? AND channel_id = ?",
    )
      .bind(next, Date.now(), row.id, row.channel_id)
      .run();
    migrated += 1;
  }
  return migrated;
}
