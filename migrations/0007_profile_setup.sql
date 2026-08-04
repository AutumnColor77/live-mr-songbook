-- First-login profile setup (nickname / avatar)
ALTER TABLE users ADD COLUMN profile_setup_done INTEGER NOT NULL DEFAULT 0;

-- Existing accounts skip onboarding
UPDATE users SET profile_setup_done = 1;
