CREATE TABLE IF NOT EXISTS shazan_auth_users_v1 (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS shazan_auth_users_v1_status_idx ON shazan_auth_users_v1(status);

CREATE TABLE IF NOT EXISTS shazan_auth_sessions_v1 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES shazan_auth_users_v1(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shazan_auth_sessions_v1_token_idx ON shazan_auth_sessions_v1(token_hash);
CREATE INDEX IF NOT EXISTS shazan_auth_sessions_v1_expiry_idx ON shazan_auth_sessions_v1(expires_at);

CREATE TABLE IF NOT EXISTS shazan_auth_attempts_v1 (
  scope_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
