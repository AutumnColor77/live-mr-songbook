CREATE TABLE IF NOT EXISTS channel_chzzk_links (
  channel_id TEXT PRIMARY KEY NOT NULL,
  chzzk_channel_id TEXT NOT NULL,
  chzzk_channel_name TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_expires_at INTEGER NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  session_status TEXT NOT NULL DEFAULT 'disconnected',
  session_detail TEXT NOT NULL DEFAULT '',
  connected_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chzzk_links_chzzk_channel
  ON channel_chzzk_links(chzzk_channel_id);
