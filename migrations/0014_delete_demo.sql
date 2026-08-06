-- Remove seeded demo channel and related rows (FK cascades where defined).
DELETE FROM requests WHERE channel_id = 'ch-demo';
DELETE FROM songs WHERE channel_id = 'ch-demo';
DELETE FROM settings WHERE channel_id = 'ch-demo';
DELETE FROM channel_members WHERE channel_id = 'ch-demo';
DELETE FROM channels WHERE id = 'ch-demo' OR slug = 'demo';
