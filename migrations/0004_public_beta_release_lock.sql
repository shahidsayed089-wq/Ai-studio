-- Public-beta release lock. Paid execution, payments and community must stay off.
UPDATE shazan_feature_flags_v1
SET enabled=0, updated_by=NULL, updated_at=unixepoch()
WHERE flag_key IN (
  'ENABLE_LIVE_PAYMENTS','ENABLE_COMMUNITY','ENABLE_FAL','ENABLE_KIE','ENABLE_OPENAI',
  'ENABLE_GOOGLE_AI','ENABLE_XAI','ENABLE_HEYGEN','ENABLE_RUNWAY','ENABLE_MUAPI'
);

UPDATE shazan_providers_v1
SET enabled=0, updated_by=NULL, updated_at=unixepoch()
WHERE provider_key<>'mock';
