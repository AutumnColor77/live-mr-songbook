-- Queue drag-reorder: stable sort key (existing rows keep created_at order)
ALTER TABLE requests ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE requests SET sort_order = created_at;
CREATE INDEX IF NOT EXISTS idx_requests_channel_status_sort
  ON requests(channel_id, status, sort_order);
