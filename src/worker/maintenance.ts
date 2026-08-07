import { migrateDataUrlThumbnails } from "./thumbnails";
import type { Bindings } from "./types";

/** Keep done/rejected history for duplicate/admin review, then drop. */
export const REQUEST_HISTORY_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const RATE_BUCKET_TTL_MS = 24 * 60 * 60 * 1000;

export async function runMaintenance(env: Bindings): Promise<{
  sessions: number;
  oauthStates: number;
  requests: number;
  rateBuckets: number;
  thumbnailsMigrated: number;
}> {
  const now = Date.now();
  const requestCutoff = now - REQUEST_HISTORY_TTL_MS;
  const rateCutoff = now - RATE_BUCKET_TTL_MS;

  const [sessions, oauthStates, requests, rateBuckets, thumbnailsMigrated] =
    await Promise.all([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?")
        .bind(now)
        .run()
        .then((r) => r.meta.changes ?? 0),
      env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?")
        .bind(now)
        .run()
        .then((r) => r.meta.changes ?? 0),
      env.DB.prepare(
        `DELETE FROM requests
         WHERE status IN ('done', 'rejected') AND created_at < ?`,
      )
        .bind(requestCutoff)
        .run()
        .then((r) => r.meta.changes ?? 0),
      env.DB.prepare("DELETE FROM rate_buckets WHERE window_start < ?")
        .bind(rateCutoff)
        .run()
        .then((r) => r.meta.changes ?? 0),
      migrateDataUrlThumbnails(env, 40),
    ]);

  return {
    sessions,
    oauthStates,
    requests,
    rateBuckets,
    thumbnailsMigrated,
  };
}
