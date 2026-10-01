-- 'push' = Live MR Manager (sync / legacy single POST), 'web' = added from /c/:slug/admin/songs.
-- Sync disableMissing only soft-disables 'push' rows.
ALTER TABLE songs ADD COLUMN origin TEXT NOT NULL DEFAULT 'push';
