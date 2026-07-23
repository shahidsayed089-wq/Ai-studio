-- Enable only the reviewed fal.ai launch path.
-- Existing wallets and ledger history are intentionally left untouched.

UPDATE shazan_providers_v1
SET enabled = 1, updated_at = unixepoch()
WHERE provider_key = 'fal';

INSERT INTO shazan_feature_flags_v1(flag_key, enabled, description, updated_at)
VALUES('ENABLE_FAL', 1, 'Verified fal.ai image/video rollout', unixepoch())
ON CONFLICT(flag_key) DO UPDATE SET
  enabled = 1,
  description = excluded.description,
  updated_at = excluded.updated_at;
