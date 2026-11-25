-- Link each prepared marketing item to a single durable draft attempt.
ALTER TABLE marketing_draft_attempts ADD COLUMN queue_item_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_draft_queue_item ON marketing_draft_attempts(queue_item_id) WHERE queue_item_id IS NOT NULL;
