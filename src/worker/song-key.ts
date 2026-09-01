/** Manager `normalizeKey(title, artist)` — trim, collapse space, lower. Not NFKC. */

export const DEFAULT_SYNC_ARTIST = "Unknown";

export function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeKey(title: string, artist: string): string {
  return `${normalizeKeyPart(title)}\0${normalizeKeyPart(artist)}`;
}

export function titleFromSync(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function artistFromSync(raw: unknown): string {
  const artist = typeof raw === "string" ? raw.trim() : "";
  return artist || DEFAULT_SYNC_ARTIST;
}
