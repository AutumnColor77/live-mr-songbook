ALTER TABLE desktop_handoff_codes ADD COLUMN app_state_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_desktop_handoff_app_state ON desktop_handoff_codes(app_state_hash);
