CREATE TABLE IF NOT EXISTS rate_buckets (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status_created
  ON requests (status, created_at);
