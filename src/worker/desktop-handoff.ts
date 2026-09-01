import { sha256Hex } from "./crypto";
import { newId } from "./id";
import { randomToken } from "./session";

const HANDOFF_TTL_MS = 2 * 60 * 1000;

export async function createDesktopHandoffCode(
  db: D1Database,
  userId: string,
): Promise<string> {
  const code = randomToken(24);
  const codeHash = await sha256Hex(code);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO desktop_handoff_codes (id, code_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(newId("dhc"), codeHash, userId, now + HANDOFF_TTL_MS, now)
    .run();
  return code;
}

export async function exchangeDesktopHandoffCode(
  db: D1Database,
  code: string,
): Promise<string | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const codeHash = await sha256Hex(trimmed);
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT user_id FROM desktop_handoff_codes
       WHERE code_hash = ? AND expires_at > ?`,
    )
    .bind(codeHash, now)
    .first<{ user_id: string }>();

  if (!row) return null;

  await db
    .prepare("DELETE FROM desktop_handoff_codes WHERE code_hash = ?")
    .bind(codeHash)
    .run();

  return row.user_id;
}

export async function purgeExpiredHandoffCodes(db: D1Database): Promise<number> {
  const result = await db
    .prepare("DELETE FROM desktop_handoff_codes WHERE expires_at < ?")
    .bind(Date.now())
    .run();
  return result.meta.changes ?? 0;
}
