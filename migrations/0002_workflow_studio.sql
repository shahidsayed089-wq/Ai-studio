PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shazan_user_profiles_v1 (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','creator','admin')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shazan_auth_identities_v1 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, provider_subject),
  FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shazan_auth_tokens_v1 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shazan_credit_wallets_v1 (
  user_id TEXT PRIMARY KEY,
  available INTEGER NOT NULL DEFAULT 400 CHECK(available >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
  spent INTEGER NOT NULL DEFAULT 0 CHECK(spent >= 0),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shazan_projects_v1 (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workflow_json TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY(owner_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS shazan_projects_v1_owner_idx ON shazan_projects_v1(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS shazan_project_versions_v1 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  workflow_json TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, version_number),
  FOREIGN KEY(project_id) REFERENCES shazan_projects_v1(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shazan_assets_v1 (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project_id TEXT,
  job_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('image','video','file')),
  source TEXT NOT NULL CHECK(source IN ('upload','generated','mock')),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  r2_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY(owner_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES shazan_projects_v1(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS shazan_assets_v1_owner_idx ON shazan_assets_v1(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shazan_project_shares_v1 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(project_id) REFERENCES shazan_projects_v1(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shazan_providers_v1 (
  provider_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  mode TEXT NOT NULL DEFAULT 'mock' CHECK(mode IN ('mock','live')),
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shazan_jobs_v1 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  provider_request_id TEXT,
  idempotency_key TEXT NOT NULL,
  workflow_json TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  estimated_credits INTEGER NOT NULL CHECK(estimated_credits > 0),
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at INTEGER,
  result_asset_id TEXT,
  last_error TEXT,
  retry_of TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  cancelled_at INTEGER,
  UNIQUE(user_id, idempotency_key),
  FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES shazan_projects_v1(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS shazan_jobs_v1_user_idx ON shazan_jobs_v1(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shazan_jobs_v1_status_idx ON shazan_jobs_v1(status, next_attempt_at, updated_at);

CREATE TABLE IF NOT EXISTS shazan_job_events_v1 (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(job_id) REFERENCES shazan_jobs_v1(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS shazan_job_events_v1_job_idx ON shazan_job_events_v1(job_id, created_at);

CREATE TABLE IF NOT EXISTS shazan_credit_ledger_v1 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT,
  event_key TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('grant','reserve','charge','refund','admin_adjustment')),
  available_delta INTEGER NOT NULL DEFAULT 0,
  reserved_delta INTEGER NOT NULL DEFAULT 0,
  spent_delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS shazan_credit_ledger_v1_user_idx ON shazan_credit_ledger_v1(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shazan_admin_credit_adjustments_v1 (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK(delta <> 0),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(target_user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shazan_audit_logs_v1 (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shazan_audit_logs_v1_created_idx ON shazan_audit_logs_v1(created_at DESC);

CREATE TABLE IF NOT EXISTS shazan_webhook_events_v1 (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  processed_at INTEGER NOT NULL,
  UNIQUE(provider_key, provider_event_id)
);

CREATE TRIGGER IF NOT EXISTS shazan_jobs_reserve_v1 AFTER INSERT ON shazan_jobs_v1
WHEN NEW.status IN ('queued','processing') BEGIN
  SELECT RAISE(ABORT,'INSUFFICIENT_CREDITS')
  WHERE COALESCE((SELECT available FROM shazan_credit_wallets_v1 WHERE user_id=NEW.user_id),-1) < NEW.estimated_credits;
  UPDATE shazan_credit_wallets_v1 SET available=available-NEW.estimated_credits,reserved=reserved+NEW.estimated_credits,updated_at=NEW.created_at WHERE user_id=NEW.user_id;
  INSERT INTO shazan_credit_ledger_v1(id,user_id,job_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,'job:'||NEW.id||':reserve','reserve',-NEW.estimated_credits,NEW.estimated_credits,0,'Workflow job credit reservation',NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS shazan_jobs_charge_v1 AFTER UPDATE OF status ON shazan_jobs_v1
WHEN NEW.status='completed' AND OLD.status<>'completed' BEGIN
  UPDATE shazan_credit_wallets_v1 SET reserved=reserved-NEW.estimated_credits,spent=spent+NEW.estimated_credits,updated_at=NEW.updated_at WHERE user_id=NEW.user_id AND reserved>=NEW.estimated_credits;
  SELECT RAISE(ABORT,'INVALID_CREDIT_RESERVATION') WHERE changes()=0;
  INSERT OR IGNORE INTO shazan_credit_ledger_v1(id,user_id,job_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,'job:'||NEW.id||':charge','charge',0,-NEW.estimated_credits,NEW.estimated_credits,'Workflow completed exactly once',NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS shazan_jobs_refund_v1 AFTER UPDATE OF status ON shazan_jobs_v1
WHEN NEW.status IN ('failed','cancelled') AND OLD.status IN ('queued','processing') BEGIN
  UPDATE shazan_credit_wallets_v1 SET available=available+NEW.estimated_credits,reserved=reserved-NEW.estimated_credits,updated_at=NEW.updated_at WHERE user_id=NEW.user_id AND reserved>=NEW.estimated_credits;
  SELECT RAISE(ABORT,'INVALID_CREDIT_REFUND') WHERE changes()=0;
  INSERT OR IGNORE INTO shazan_credit_ledger_v1(id,user_id,job_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,'job:'||NEW.id||':refund','refund',NEW.estimated_credits,-NEW.estimated_credits,0,iif(NEW.status='cancelled','Cancelled job refund','Permanently failed job refund'),NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS shazan_admin_credit_apply_v1 AFTER INSERT ON shazan_admin_credit_adjustments_v1 BEGIN
  SELECT RAISE(ABORT,'INSUFFICIENT_CREDITS')
  WHERE COALESCE((SELECT available FROM shazan_credit_wallets_v1 WHERE user_id=NEW.target_user_id),-1)+NEW.delta<0;
  UPDATE shazan_credit_wallets_v1 SET available=available+NEW.delta,updated_at=NEW.created_at WHERE user_id=NEW.target_user_id;
  INSERT INTO shazan_credit_ledger_v1(id,user_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.target_user_id,'admin:'||NEW.id,'admin_adjustment',NEW.delta,0,0,NEW.reason,NEW.created_at);
END;

INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('mock','SHAZAN Mock Provider',1,'mock',unixepoch());
INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('fal','fal.ai',1,'live',unixepoch());
INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('kie','Kie.ai',0,'live',unixepoch());
INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('openai','OpenAI',0,'live',unixepoch());
INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('google','Google AI',0,'live',unixepoch());
INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('xai','xAI',0,'live',unixepoch());
INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('heygen','HeyGen',0,'live',unixepoch());
