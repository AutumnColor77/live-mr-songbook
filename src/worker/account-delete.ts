import { chzzkConfigured, revokeChzzkToken } from "./chzzk/api";
import { deleteChzzkLink, getChzzkLink } from "./chzzk/links";
import { deleteThumbnailBlob } from "./thumbnails";
import type { Bindings } from "./types";

async function stopChzzkSession(env: Bindings, channelId: string): Promise<void> {
  if (!env.CHZZK_SESSION) return;
  const stub = env.CHZZK_SESSION.get(env.CHZZK_SESSION.idFromName(channelId));
  await stub.fetch("https://do/stop", { method: "POST" }).catch(() => undefined);
}

async function unlinkChzzkBestEffort(
  env: Bindings,
  channelId: string,
): Promise<void> {
  try {
    await stopChzzkSession(env, channelId);
    const link = await getChzzkLink(env.DB, channelId, env);
    if (link && chzzkConfigured(env)) {
      await revokeChzzkToken({
        clientId: env.CHZZK_CLIENT_ID!,
        clientSecret: env.CHZZK_CLIENT_SECRET!,
        token: link.refresh_token,
        tokenTypeHint: "refresh_token",
      });
    }
    await deleteChzzkLink(env.DB, channelId);
  } catch (err) {
    console.error("[account-delete] chzzk unlink", channelId, err);
  }
}

async function deleteChannelCascade(
  env: Bindings,
  channelId: string,
): Promise<void> {
  await unlinkChzzkBestEffort(env, channelId);

  const { results: songs } = await env.DB.prepare(
    "SELECT id, thumbnail FROM songs WHERE channel_id = ?",
  )
    .bind(channelId)
    .all<{ id: string; thumbnail: string }>();

  for (const song of songs ?? []) {
    await deleteThumbnailBlob(env, channelId, song.id, song.thumbnail ?? "");
  }

  // songs/requests/settings lack ON DELETE CASCADE — delete explicitly.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM requests WHERE channel_id = ?").bind(channelId),
    env.DB.prepare("DELETE FROM songs WHERE channel_id = ?").bind(channelId),
    env.DB.prepare("DELETE FROM settings WHERE channel_id = ?").bind(channelId),
    env.DB.prepare("DELETE FROM channels WHERE id = ?").bind(channelId),
  ]);
}

/** Hard-delete owned channels then the user row (sessions cascade via FK). */
export async function deleteUserAccount(
  env: Bindings,
  userId: string,
): Promise<void> {
  const { results: channels } = await env.DB.prepare(
    `SELECT c.id FROM channel_members cm
     JOIN channels c ON c.id = cm.channel_id
     WHERE cm.user_id = ? AND cm.role = 'admin' AND c.slug != 'demo'`,
  )
    .bind(userId)
    .all<{ id: string }>();

  for (const ch of channels ?? []) {
    await deleteChannelCascade(env, ch.id);
  }

  // Drop any non-admin memberships before removing the user.
  await env.DB.prepare("DELETE FROM channel_members WHERE user_id = ?")
    .bind(userId)
    .run();

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

export const ACCOUNT_DELETE_CONFIRM = "탈퇴";
