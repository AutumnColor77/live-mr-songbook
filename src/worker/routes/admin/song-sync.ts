import { Hono } from "hono";
import { newId } from "../../id";
import { SYNC_MAX_BODY_BYTES, SYNC_MAX_SONGS, SYNC_THUMB_CONCURRENCY } from "../../limits";
import { artistFromSync, normalizeKey, titleFromSync } from "../../song-key";
import { persistThumbnail } from "../../thumbnails";
import type { AppEnv, SongRow } from "../../types";
import {
  fieldsFromPostPayload,
  hasRejectedOriginalUrl,
  INSERT_SONG_SQL,
  isOversizedDataUrlThumbnail,
  songInsertBinds,
  songUpdateBinds,
  songWriteFieldsEqual,
  thumbnailsEquivalent,
  UPDATE_SONG_SQL,
  type SongPayload,
  type SongWriteFields,
} from "./song-fields";

type SyncError = {
  index: number;
  title: string;
  artist: string;
  message: string;
};

type PlannedWrite = {
  kind: "insert" | "update";
  id: string;
  fields: SongWriteFields;
  thumbnailRaw: unknown;
  skipThumbnail: boolean;
  existingThumbnail: string;
};

const songSync = new Hono<AppEnv>();

songSync.put("/songs/sync", async (c) => {
  const channel = c.get("channel");
  if (channel.slug === "demo") {
    return c.json({ error: "데모 채널은 수정할 수 없습니다." }, 403);
  }

  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > SYNC_MAX_BODY_BYTES) {
    return c.json({ error: "Request body too large" }, 413);
  }

  let body: { songs?: unknown; disableMissing?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.songs)) {
    return c.json({ error: "songs must be an array" }, 422);
  }
  if (body.songs.length > SYNC_MAX_SONGS) {
    return c.json({ error: `songs array exceeds ${SYNC_MAX_SONGS} items` }, 422);
  }

  const disableMissing = Boolean(body.disableMissing);
  const channelId = channel.id;
  const { results } = await c.env.DB.prepare("SELECT * FROM songs WHERE channel_id = ?")
    .bind(channelId)
    .all<SongRow>();

  const canonical = new Map<string, SongRow>();
  for (const row of results ?? []) {
    const key = normalizeKey(row.title, row.artist);
    const prev = canonical.get(key);
    if (!prev || isBetterCanonical(row, prev)) canonical.set(key, row);
  }

  const errors: SyncError[] = [];
  let skippedEmpty = 0;
  const lastByKey = new Map<string, { item: SongPayload; fields: SongWriteFields }>();

  for (let index = 0; index < body.songs.length; index++) {
    const raw = body.songs[index];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({
        index,
        title: "",
        artist: "",
        message: "invalid song object",
      });
      continue;
    }
    const item = raw as SongPayload;
    const title = titleFromSync(item.title);
    const artist = artistFromSync(item.artist);
    if (!title) {
      skippedEmpty += 1;
      continue;
    }
    if (isOversizedDataUrlThumbnail(item.thumbnail)) {
      errors.push({ index, title, artist, message: "thumbnail too large" });
      continue;
    }
    if (hasRejectedOriginalUrl(item.originalUrl)) {
      errors.push({ index, title, artist, message: "invalid originalUrl" });
      continue;
    }
    const fields = fieldsFromPostPayload(item, title, artist, 1);
    lastByKey.set(normalizeKey(title, artist), { item, fields });
  }

  const payloadKeys = new Set(lastByKey.keys());
  const writes: PlannedWrite[] = [];
  let added = 0;
  let updated = 0;
  let skipped = skippedEmpty;

  for (const [key, planned] of lastByKey) {
    const existing = canonical.get(key);
    if (!existing) {
      writes.push({
        kind: "insert",
        id: newId("song"),
        fields: planned.fields,
        thumbnailRaw: planned.item.thumbnail,
        skipThumbnail: false,
        existingThumbnail: "",
      });
      added += 1;
      continue;
    }

    const thumbsSame = thumbnailsEquivalent(
      planned.item.thumbnail,
      existing.thumbnail ?? "",
      channelId,
      existing.id,
    );
    if (
      existing.enabled === 1 &&
      songWriteFieldsEqual(existing, planned.fields) &&
      thumbsSame
    ) {
      skipped += 1;
      continue;
    }

    writes.push({
      kind: "update",
      id: existing.id,
      fields: planned.fields,
      thumbnailRaw: planned.item.thumbnail,
      skipThumbnail: thumbsSame,
      existingThumbnail: existing.thumbnail ?? "",
    });
    updated += 1;
  }

  const disableIds: string[] = [];
  if (disableMissing) {
    for (const row of results ?? []) {
      if (row.enabled !== 1) continue;
      const key = normalizeKey(row.title, row.artist);
      if (payloadKeys.has(key)) continue;
      disableIds.push(row.id);
    }
  }

  const now = Date.now();
  const thumbJobs = writes.filter((write) => !write.skipThumbnail);
  const thumbs = await mapPool(thumbJobs, SYNC_THUMB_CONCURRENCY, (write) =>
    persistThumbnail(
      c.env,
      channelId,
      write.id,
      write.thumbnailRaw,
      write.existingThumbnail,
    ),
  );
  const thumbById = new Map<string, string>();
  thumbJobs.forEach((write, i) => {
    thumbById.set(write.id, thumbs[i] ?? "");
  });

  const statements: D1PreparedStatement[] = [];
  for (const write of writes) {
    const thumbnail = write.skipThumbnail
      ? write.existingThumbnail
      : (thumbById.get(write.id) ?? "");
    if (write.kind === "insert") {
      statements.push(
        c.env.DB.prepare(INSERT_SONG_SQL).bind(
          ...songInsertBinds(write.id, channelId, write.fields, thumbnail, now),
        ),
      );
    } else {
      statements.push(
        c.env.DB.prepare(UPDATE_SONG_SQL).bind(
          ...songUpdateBinds(write.fields, thumbnail, now, write.id, channelId),
        ),
      );
    }
  }
  for (const id of disableIds) {
    statements.push(
      c.env.DB.prepare(
        "UPDATE songs SET enabled = 0, updated_at = ? WHERE id = ? AND channel_id = ?",
      ).bind(now, id, channelId),
    );
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({
    added,
    updated,
    skipped,
    disabled: disableIds.length,
    failed: errors.length,
    errors,
  });
});

function isBetterCanonical(candidate: SongRow, current: SongRow): boolean {
  if (candidate.enabled !== current.enabled) return candidate.enabled === 1;
  if (candidate.updated_at !== current.updated_at) {
    return candidate.updated_at > current.updated_at;
  }
  return candidate.id < current.id;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i] as T);
    }
  };
  const n = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

export default songSync;
