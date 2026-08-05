/** Default settings rows inserted when a channel is created. */
export function seedDefaultChannelSettings(
  db: D1Database,
  channelId: string,
  createdAt: number,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO settings (channel_id, key, value) VALUES (?, 'accepting_requests', 'true')`,
      )
      .bind(channelId),
    db
      .prepare(
        `INSERT INTO settings (channel_id, key, value) VALUES (?, 'now_playing_id', '')`,
      )
      .bind(channelId),
    db
      .prepare(
        `INSERT INTO settings (channel_id, key, value) VALUES (?, 'duplicate_policy', 'allow')`,
      )
      .bind(channelId),
    db
      .prepare(
        `INSERT INTO settings (channel_id, key, value) VALUES (?, 'duplicate_session_started_at', ?)`,
      )
      .bind(channelId, String(createdAt)),
  ];
}

export function upsertSetting(
  db: D1Database,
  channelId: string,
  key: string,
  value: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO settings (channel_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(channel_id, key) DO UPDATE SET value = excluded.value`,
    )
    .bind(channelId, key, value);
}
