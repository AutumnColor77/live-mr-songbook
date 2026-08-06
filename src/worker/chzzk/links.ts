export type ChzzkLinkRow = {
  channel_id: string;
  chzzk_channel_id: string;
  chzzk_channel_name: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: number;
  scopes: string;
  session_status: string;
  session_detail: string;
  connected_at: number;
  updated_at: number;
};

export async function getChzzkLink(
  db: D1Database,
  channelId: string,
): Promise<ChzzkLinkRow | null> {
  return db
    .prepare("SELECT * FROM channel_chzzk_links WHERE channel_id = ?")
    .bind(channelId)
    .first<ChzzkLinkRow>();
}

export async function upsertChzzkLink(
  db: D1Database,
  row: {
    channelId: string;
    chzzkChannelId: string;
    chzzkChannelName: string;
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    scopes: string;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO channel_chzzk_links (
         channel_id, chzzk_channel_id, chzzk_channel_name,
         access_token, refresh_token, access_expires_at, scopes,
         session_status, session_detail, connected_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'disconnected', '', ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET
         chzzk_channel_id = excluded.chzzk_channel_id,
         chzzk_channel_name = excluded.chzzk_channel_name,
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         access_expires_at = excluded.access_expires_at,
         scopes = excluded.scopes,
         updated_at = excluded.updated_at`,
    )
    .bind(
      row.channelId,
      row.chzzkChannelId,
      row.chzzkChannelName,
      row.accessToken,
      row.refreshToken,
      row.accessExpiresAt,
      row.scopes,
      now,
      now,
    )
    .run();
}

export async function updateChzzkTokens(
  db: D1Database,
  channelId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    scopes?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE channel_chzzk_links SET
         access_token = ?, refresh_token = ?, access_expires_at = ?,
         scopes = COALESCE(?, scopes), updated_at = ?
       WHERE channel_id = ?`,
    )
    .bind(
      tokens.accessToken,
      tokens.refreshToken,
      tokens.accessExpiresAt,
      tokens.scopes ?? null,
      Date.now(),
      channelId,
    )
    .run();
}

export async function updateChzzkSessionStatus(
  db: D1Database,
  channelId: string,
  status: string,
  detail = "",
): Promise<void> {
  await db
    .prepare(
      `UPDATE channel_chzzk_links
       SET session_status = ?, session_detail = ?, updated_at = ?
       WHERE channel_id = ?`,
    )
    .bind(status, detail.slice(0, 500), Date.now(), channelId)
    .run();
}

export async function deleteChzzkLink(db: D1Database, channelId: string): Promise<void> {
  await db
    .prepare("DELETE FROM channel_chzzk_links WHERE channel_id = ?")
    .bind(channelId)
    .run();
}

export function publicChzzkStatus(link: ChzzkLinkRow | null) {
  if (!link) {
    return {
      linked: false as const,
      chzzkChannelId: null,
      chzzkChannelName: null,
      sessionStatus: "disconnected",
      sessionDetail: "",
      connectedAt: null as number | null,
    };
  }
  return {
    linked: true as const,
    chzzkChannelId: link.chzzk_channel_id,
    chzzkChannelName: link.chzzk_channel_name,
    sessionStatus: link.session_status,
    sessionDetail: link.session_detail,
    connectedAt: link.connected_at,
  };
}
