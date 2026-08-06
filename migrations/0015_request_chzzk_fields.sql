-- Paid/chat request fields + idempotency refs
ALTER TABLE requests ADD COLUMN pay_amount INTEGER;
ALTER TABLE requests ADD COLUMN donation_ref TEXT;
ALTER TABLE requests ADD COLUMN chat_message_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_channel_donation_ref
  ON requests(channel_id, donation_ref)
  WHERE donation_ref IS NOT NULL AND donation_ref != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_channel_chat_ref
  ON requests(channel_id, chat_message_ref)
  WHERE chat_message_ref IS NOT NULL AND chat_message_ref != '';
