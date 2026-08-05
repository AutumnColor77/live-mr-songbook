export type DuplicatePolicy = "allow" | "queue" | "played";

const VALID_POLICIES = new Set<DuplicatePolicy>(["allow", "queue", "played"]);

export function isDuplicatePolicy(value: string): value is DuplicatePolicy {
  return VALID_POLICIES.has(value as DuplicatePolicy);
}

/** Resolve policy from settings rows; falls back to legacy allow_duplicate_requests. */
export function resolveDuplicatePolicy(
  policyValue: string | null | undefined,
  legacyAllowValue: string | null | undefined,
): DuplicatePolicy {
  if (policyValue && isDuplicatePolicy(policyValue)) return policyValue;
  if ((legacyAllowValue ?? "true") === "false") return "queue";
  return "allow";
}

export async function loadDuplicatePolicy(
  db: D1Database,
  channelId: string,
): Promise<{ policy: DuplicatePolicy; sessionStartedAt: number }> {
  const [policyRow, legacyRow, sessionRow] = await Promise.all([
    db
      .prepare(
        "SELECT value FROM settings WHERE channel_id = ? AND key = 'duplicate_policy'",
      )
      .bind(channelId)
      .first<{ value: string }>(),
    db
      .prepare(
        "SELECT value FROM settings WHERE channel_id = ? AND key = 'allow_duplicate_requests'",
      )
      .bind(channelId)
      .first<{ value: string }>(),
    db
      .prepare(
        "SELECT value FROM settings WHERE channel_id = ? AND key = 'duplicate_session_started_at'",
      )
      .bind(channelId)
      .first<{ value: string }>(),
  ]);

  const policy = resolveDuplicatePolicy(policyRow?.value, legacyRow?.value);
  const parsed = Number(sessionRow?.value ?? "");
  const sessionStartedAt = Number.isFinite(parsed) ? parsed : 0;
  return { policy, sessionStartedAt };
}

export async function loadBlockedSongIds(
  db: D1Database,
  channelId: string,
  policy: DuplicatePolicy,
  sessionStartedAt: number,
): Promise<string[]> {
  if (policy === "allow") return [];

  if (policy === "queue") {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT song_id AS songId FROM requests
         WHERE channel_id = ? AND song_id IS NOT NULL
           AND status IN ('pending', 'playing')`,
      )
      .bind(channelId)
      .all<{ songId: string }>();
    return (results ?? []).map((r) => r.songId).filter(Boolean);
  }

  const { results } = await db
    .prepare(
      `SELECT DISTINCT song_id AS songId FROM requests
       WHERE channel_id = ? AND song_id IS NOT NULL
         AND (
           status IN ('pending', 'playing')
           OR (status = 'done' AND created_at >= ?)
         )`,
    )
    .bind(channelId, sessionStartedAt)
    .all<{ songId: string }>();
  return (results ?? []).map((r) => r.songId).filter(Boolean);
}

export async function findDuplicateConflict(
  db: D1Database,
  channelId: string,
  songId: string,
  policy: DuplicatePolicy,
  sessionStartedAt: number,
): Promise<"queue" | "played" | null> {
  if (policy === "allow") return null;

  const active = await db
    .prepare(
      `SELECT id FROM requests
       WHERE channel_id = ? AND song_id = ? AND status IN ('pending', 'playing')
       LIMIT 1`,
    )
    .bind(channelId, songId)
    .first<{ id: string }>();
  if (active) return "queue";

  if (policy === "played") {
    const done = await db
      .prepare(
        `SELECT id FROM requests
         WHERE channel_id = ? AND song_id = ? AND status = 'done' AND created_at >= ?
         LIMIT 1`,
      )
      .bind(channelId, songId, sessionStartedAt)
      .first<{ id: string }>();
    if (done) return "played";
  }

  return null;
}
