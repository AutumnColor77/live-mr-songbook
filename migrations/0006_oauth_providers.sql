-- Multi-provider OAuth identity (google | naver)
ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'google';
ALTER TABLE users ADD COLUMN provider_sub TEXT;

UPDATE users
SET provider = 'google',
    provider_sub = google_sub
WHERE provider_sub IS NULL OR provider_sub = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_sub ON users(provider, provider_sub);
