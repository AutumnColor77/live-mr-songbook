ALTER TABLE oauth_states ADD COLUMN next_path TEXT NOT NULL DEFAULT '/c/demo/admin';

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
