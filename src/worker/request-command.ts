import type { SongRow } from "./types";

const EM_DASH_SEP = " — ";

export function normalizeMatchText(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Build copy-paste command for a song. Uses em dash if artist/title contain `-`. */
export function buildRequestCommand(
  prefix: string,
  artist: string,
  title: string,
  separator = "-",
): string {
  const a = artist.trim();
  const t = title.trim();
  const sep =
    a.includes("-") || t.includes("-") || separator === "—"
      ? EM_DASH_SEP
      : separator || "-";
  return `${prefix.trim()} ${a}${sep}${t}`;
}

export type ParsedRequestCommand = {
  artist: string;
  title: string;
};

/** Cheap prefix gate (case-insensitive NFKC) before heavier parse / DB work. */
export function hasRequestCommandPrefix(text: string, prefix: string): boolean {
  const trimmed = text.normalize("NFKC").trim();
  const prefixNorm = prefix.normalize("NFKC").trim();
  if (!trimmed || !prefixNorm) return false;
  return trimmed.toLowerCase().startsWith(prefixNorm.toLowerCase());
}

/**
 * Parse `!신청 artist-title` (or em-dash / custom separator).
 * Prefix match is case-insensitive after NFKC normalize of the leading token area.
 */
export function parseRequestCommand(
  text: string,
  prefix: string,
  separator = "-",
): ParsedRequestCommand | null {
  const trimmed = text.normalize("NFKC").trim();
  if (!trimmed) return null;

  const prefixNorm = prefix.normalize("NFKC").trim();
  if (!prefixNorm) return null;

  if (!hasRequestCommandPrefix(trimmed, prefixNorm)) return null;

  let body = trimmed.slice(prefixNorm.length).trim();
  if (!body) return null;

  const seps = [EM_DASH_SEP];
  const sep = (separator || "-").normalize("NFKC");
  if (sep && sep !== "-" && sep !== EM_DASH_SEP) seps.push(sep);
  seps.push("-");

  for (const s of seps) {
    const idx = body.indexOf(s);
    if (idx < 0) continue;
    const artist = body.slice(0, idx).trim();
    const title = body.slice(idx + s.length).trim();
    if (artist && title) return { artist, title };
  }

  return null;
}

export function findMatchingSongs(
  songs: SongRow[],
  artist: string,
  title: string,
): SongRow[] {
  const a = normalizeMatchText(artist);
  const t = normalizeMatchText(title);
  return songs.filter(
    (s) =>
      s.enabled === 1 &&
      normalizeMatchText(s.artist) === a &&
      normalizeMatchText(s.title) === t,
  );
}
