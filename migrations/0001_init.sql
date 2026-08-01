CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  admin_token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'KPOP',
  tags TEXT NOT NULL DEFAULT '[]',
  song_key TEXT,
  bpm INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE INDEX IF NOT EXISTS idx_songs_channel ON songs(channel_id);
CREATE INDEX IF NOT EXISTS idx_songs_channel_category ON songs(channel_id, category);
CREATE INDEX IF NOT EXISTS idx_songs_channel_enabled ON songs(channel_id, enabled);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  song_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '익명',
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (song_id) REFERENCES songs(id)
);

CREATE INDEX IF NOT EXISTS idx_requests_channel_status ON requests(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_channel_created ON requests(channel_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  channel_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (channel_id, key),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);
