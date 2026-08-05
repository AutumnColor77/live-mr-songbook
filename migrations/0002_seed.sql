-- Demo channel. Plain admin token (local only): demo-channel-token
-- SHA-256: fb67392058c459fdaad1f4352988c56cbbcbaa7b92ad607c4ca73f6ff8c52bb8
INSERT OR IGNORE INTO channels (id, slug, name, admin_token_hash, created_at) VALUES
  (
    'ch-demo',
    'demo',
    'Demo Songbook',
    'fb67392058c459fdaad1f4352988c56cbbcbaa7b92ad607c4ca73f6ff8c52bb8',
    1722470400000
  );

INSERT OR IGNORE INTO settings (channel_id, key, value) VALUES
  ('ch-demo', 'accepting_requests', 'true'),
  ('ch-demo', 'now_playing_id', ''),
  ('ch-demo', 'allow_duplicate_requests', 'true');

INSERT OR IGNORE INTO songs (id, channel_id, title, artist, category, tags, song_key, bpm, enabled, created_at, updated_at) VALUES
  ('song-1', 'ch-demo', '사건의 지평선', '윤하', 'KPOP', '["MR","원키"]', 'A', 130, 1, 1722470400000, 1722470400000),
  ('song-2', 'ch-demo', 'First Love', 'Utada Hikaru', 'JPOP', '["원키"]', 'C', 100, 1, 1722470400000, 1722470400000),
  ('song-3', 'ch-demo', '스물다섯, 스물하나', '자우림', 'KPOP', '["MR","여키"]', 'G', 95, 1, 1722470400000, 1722470400000),
  ('song-4', 'ch-demo', '귀로', '나얼', 'KPOP', '["MR"]', 'E', 72, 1, 1722470400000, 1722470400000),
  ('song-5', 'ch-demo', 'Shape of You', 'Ed Sheeran', 'POP', '["MR","원키"]', 'C#m', 96, 1, 1722470400000, 1722470400000),
  ('song-6', 'ch-demo', '주저하는 연인들을 위해', '잔나비', 'KPOP', '["MR"]', 'D', 110, 1, 1722470400000, 1722470400000),
  ('song-7', 'ch-demo', '질풍가도', '유정석', 'OST', '["원키","남키"]', 'Am', 140, 1, 1722470400000, 1722470400000),
  ('song-8', 'ch-demo', '벚꽃엔딩', '버스커 버스커', 'KPOP', '["MR","원키"]', 'C', 118, 1, 1722470400000, 1722470400000),
  ('song-9', 'ch-demo', 'Hotel California', 'Eagles', 'POP', '["MR"]', 'Bm', 75, 1, 1722470400000, 1722470400000),
  ('song-10', 'ch-demo', '残酷な天使のテーゼ', '高橋洋子', 'OST', '["원키"]', 'C', 128, 1, 1722470400000, 1722470400000),
  ('song-11', 'ch-demo', '밤양갱', '비비', 'KPOP', '["MR","여키"]', 'F#m', 100, 1, 1722470400000, 1722470400000);

INSERT OR IGNORE INTO requests (id, channel_id, song_id, title, artist, nickname, comment, status, created_at) VALUES
  ('req-demo-1', 'ch-demo', 'song-1', '사건의 지평선', '윤하', '시청자A', '', 'pending', 1722470500000);
