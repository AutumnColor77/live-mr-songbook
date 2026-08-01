CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'KPOP',
  tags TEXT NOT NULL DEFAULT '[]',
  song_key TEXT,
  bpm INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
CREATE INDEX IF NOT EXISTS idx_songs_enabled ON songs(enabled);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  song_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '익명',
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (song_id) REFERENCES songs(id)
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('accepting_requests', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('now_playing_id', '');
