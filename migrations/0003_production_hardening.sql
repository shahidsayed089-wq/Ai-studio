-- Backend-only public beta hardening. No visual/UI data is modified.

CREATE TABLE IF NOT EXISTS shazan_feature_flags_v1 (
  flag_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shazan_job_leases_v1 (
  job_id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  leased_until INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(job_id) REFERENCES shazan_jobs_v1(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shazan_job_leases_v1_expiry_idx
  ON shazan_job_leases_v1(leased_until);

CREATE TABLE IF NOT EXISTS shazan_job_attempts_v1 (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','completed','failed','released')),
  error_code TEXT,
  error_message TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE(job_id, attempt_number),
  FOREIGN KEY(job_id) REFERENCES shazan_jobs_v1(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shazan_job_attempts_v1_job_idx
  ON shazan_job_attempts_v1(job_id, started_at DESC);

INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at)
  VALUES('runway','Runway',0,'live',unixepoch());
INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at)
  VALUES('muapi','MuAPI',0,'live',unixepoch());

INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('PUBLIC_BETA',1,'Allow public beta registration',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_DEMO_PROVIDER',1,'Allow clearly labeled Demo Provider jobs',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_LIVE_PAYMENTS',0,'Accept live payment events',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_COMMUNITY',0,'Enable community publishing APIs',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_GOOGLE_AUTH',1,'Allow Google OAuth when configured',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_FAL',0,'Enable verified fal.ai adapter',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_KIE',0,'Enable verified Kie adapter',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_OPENAI',0,'Enable verified OpenAI adapter',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_GOOGLE_AI',0,'Enable verified Google AI adapter',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_XAI',0,'Enable verified xAI adapter',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_HEYGEN',0,'Enable verified HeyGen adapter',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_RUNWAY',0,'Enable verified Runway adapter',NULL,unixepoch());
INSERT OR IGNORE INTO shazan_feature_flags_v1 VALUES('ENABLE_MUAPI',0,'Enable verified MuAPI adapter',NULL,unixepoch());
