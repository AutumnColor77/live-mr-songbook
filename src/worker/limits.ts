/** Display / request nickname character limit (keep in sync with client/limits.ts). */
export const NICKNAME_MAX_LENGTH = 20;

/** Live MR Manager bulk library push (`PUT .../admin/songs/sync`). */
export const SYNC_MAX_SONGS = 500;
export const SYNC_MAX_BODY_BYTES = 50_000_000;
export const SYNC_THUMB_CONCURRENCY = 8;

export function clampNickname(raw: string, fallback = ""): string {
  const trimmed = raw.trim().slice(0, NICKNAME_MAX_LENGTH);
  return trimmed || fallback;
}
