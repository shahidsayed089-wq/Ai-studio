-- Public consumer generation uses the server-side fal.ai adapter.
-- Payments, community and every other live provider remain release-locked off.
INSERT INTO shazan_feature_flags_v1(flag_key,enabled,description,updated_at)
VALUES('ENABLE_FAL',1,'Server-side fal.ai generation for verified users',unixepoch())
ON CONFLICT(flag_key) DO UPDATE SET
  enabled=1,
  description=excluded.description,
  updated_by=NULL,
  updated_at=excluded.updated_at;

INSERT INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at)
VALUES('fal','fal.ai',1,'live',unixepoch())
ON CONFLICT(provider_key) DO UPDATE SET
  enabled=1,
  display_name=excluded.display_name,
  mode='live',
  updated_by=NULL,
  updated_at=excluded.updated_at;

UPDATE shazan_feature_flags_v1
SET enabled=0, updated_by=NULL, updated_at=unixepoch()
WHERE flag_key IN (
  'ENABLE_LIVE_PAYMENTS','ENABLE_COMMUNITY','ENABLE_KIE','ENABLE_OPENAI',
  'ENABLE_GOOGLE_AI','ENABLE_XAI','ENABLE_HEYGEN','ENABLE_RUNWAY','ENABLE_MUAPI'
);

UPDATE shazan_providers_v1
SET enabled=0, updated_by=NULL, updated_at=unixepoch()
WHERE provider_key NOT IN ('mock','fal');
