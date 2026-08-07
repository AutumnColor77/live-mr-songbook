/** Display / request nickname character limit (keep in sync with client/limits.ts). */
export const NICKNAME_MAX_LENGTH = 20;

export function clampNickname(raw: string, fallback = ""): string {
  const trimmed = raw.trim().slice(0, NICKNAME_MAX_LENGTH);
  return trimmed || fallback;
}
