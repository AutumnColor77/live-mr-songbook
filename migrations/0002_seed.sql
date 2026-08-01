-- Example songs from planning Q&A (idempotent seed)
INSERT OR IGNORE INTO songs (id, title, artist, category, tags, song_key, bpm, enabled, created_at, updated_at) VALUES
  ('song-1', '사건의 지평선', '윤하', 'KPOP', '["MR","원키"]', 'A', 130, 1, 1722470400000, 1722470400000),
  ('song-2', 'First Love', 'Utada Hikaru', 'JPOP', '["원키"]', 'C', 100, 1, 1722470400000, 1722470400000),
  ('song-3', '스물다섯, 스물하나', '자우림', 'KPOP', '["MR","여키"]', 'G', 95, 1, 1722470400000, 1722470400000),
  ('song-4', '귀로', '나얼', 'KPOP', '["MR"]', 'E', 72, 1, 1722470400000, 1722470400000),
  ('song-5', 'Shape of You', 'Ed Sheeran', 'POP', '["MR","원키"]', 'C#m', 96, 1, 1722470400000, 1722470400000),
  ('song-6', '주저하는 연인들을 위해', '잔나비', 'KPOP', '["MR"]', 'D', 110, 1, 1722470400000, 1722470400000),
  ('song-7', '질풍가도', '유정석', 'OST', '["원키","남키"]', 'Am', 140, 1, 1722470400000, 1722470400000),
  ('song-8', '벚꽃엔딩', '버스커 버스커', 'KPOP', '["MR","원키"]', 'C', 118, 1, 1722470400000, 1722470400000),
  ('song-9', 'Hotel California', 'Eagles', 'POP', '["MR"]', 'Bm', 75, 1, 1722470400000, 1722470400000),
  ('song-10', '残酷な天使のテーゼ', '高橋洋子', 'OST', '["원키"]', 'C', 128, 1, 1722470400000, 1722470400000),
  ('song-11', '밤양갱', '비비', 'KPOP', '["MR","여키"]', 'F#m', 100, 1, 1722470400000, 1722470400000);

INSERT OR IGNORE INTO requests (id, song_id, title, artist, nickname, comment, status, created_at) VALUES
  ('req-demo-1', 'song-1', '사건의 지평선', '윤하', '시청자A', '', 'pending', 1722470500000);
