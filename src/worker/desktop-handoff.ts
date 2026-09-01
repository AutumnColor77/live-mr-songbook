import { sha256Hex } from "./crypto";
import { newId } from "./id";
import { randomToken } from "./session";

const HANDOFF_TTL_MS = 2 * 60 * 1000;

/** Manager-generated nonce (`begin_songbook_oauth`). */
export function sanitizeDesktopAppState(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!/^[a-zA-Z0-9]{16,64}$/.test(value)) return null;
  return value;
}

export async function createDesktopHandoffCode(
  db: D1Database,
  userId: string,
  appState?: string | null,
): Promise<string> {
  const code = randomToken(24);
  const codeHash = await sha256Hex(code);
  const stateHash = appState ? await sha256Hex(appState) : null;
  const now = Date.now();
  if (stateHash) {
    await db
      .prepare("DELETE FROM desktop_handoff_codes WHERE app_state_hash = ?")
      .bind(stateHash)
      .run()
      .catch(() => undefined);
  }
  await db
    .prepare(
      `INSERT INTO desktop_handoff_codes (id, code_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(newId("dhc"), codeHash, userId, now + HANDOFF_TTL_MS, now)
    .run();
  if (stateHash) {
    await db
      .prepare("UPDATE desktop_handoff_codes SET app_state_hash = ? WHERE code_hash = ?")
      .bind(stateHash, codeHash)
      .run()
      .catch(() => undefined);
  }
  return code;
}

async function consumeHandoffRow(
  db: D1Database,
  row: { user_id: string; code_hash: string } | null,
): Promise<string | null> {
  if (!row) return null;
  await db
    .prepare("DELETE FROM desktop_handoff_codes WHERE code_hash = ?")
    .bind(row.code_hash)
    .run();
  return row.user_id;
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
      `SELECT user_id, code_hash FROM desktop_handoff_codes
       WHERE code_hash = ? AND expires_at > ?`,
    )
    .bind(codeHash, now)
    .first<{ user_id: string; code_hash: string }>();

  return consumeHandoffRow(db, row);
}

export async function exchangeDesktopHandoffAppState(
  db: D1Database,
  appState: string,
): Promise<string | null> {
  const sanitized = sanitizeDesktopAppState(appState);
  if (!sanitized) return null;

  const stateHash = await sha256Hex(sanitized);
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT user_id, code_hash FROM desktop_handoff_codes
       WHERE app_state_hash = ? AND expires_at > ?
       ORDER BY created_at DESC`,
    )
    .bind(stateHash, now)
    .first<{ user_id: string; code_hash: string }>();

  return consumeHandoffRow(db, row);
}

export async function purgeExpiredHandoffCodes(db: D1Database): Promise<number> {
  const result = await db
    .prepare("DELETE FROM desktop_handoff_codes WHERE expires_at < ?")
    .bind(Date.now())
    .run();
  return result.meta.changes ?? 0;
}
