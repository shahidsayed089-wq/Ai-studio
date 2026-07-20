import {
  canTransitionJob,
  canonicalWorkflow,
  mockProgressForAge,
  retryDelaySeconds,
  safePagination,
  sanitizeFilename,
  validateWorkflow,
} from "./workflow-domain.js";
import { getProviderAdapter } from "./providers/provider-registry.js";

const WORKFLOW_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS shazan_user_profiles_v1 (
    user_id TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','creator','admin')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_auth_identities_v1 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_subject TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(provider, provider_subject),
    FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_auth_tokens_v1 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','reset_password')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_credit_wallets_v1 (
    user_id TEXT PRIMARY KEY,
    available INTEGER NOT NULL DEFAULT 500 CHECK(available >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
    spent INTEGER NOT NULL DEFAULT 0 CHECK(spent >= 0),
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_projects_v1 (
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
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_projects_v1_owner_idx ON shazan_projects_v1(owner_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS shazan_project_versions_v1 (
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
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_assets_v1 (
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
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_assets_v1_owner_idx ON shazan_assets_v1(owner_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS shazan_project_shares_v1 (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(project_id) REFERENCES shazan_projects_v1(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_providers_v1 (
    provider_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    mode TEXT NOT NULL DEFAULT 'mock' CHECK(mode IN ('mock','live')),
    updated_by TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_feature_flags_v1 (
    flag_key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
    description TEXT NOT NULL DEFAULT '',
    updated_by TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_jobs_v1 (
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
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_jobs_v1_user_idx ON shazan_jobs_v1(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS shazan_jobs_v1_status_idx ON shazan_jobs_v1(status, next_attempt_at, updated_at)`,
  `CREATE TABLE IF NOT EXISTS shazan_job_leases_v1 (
    job_id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    leased_until INTEGER NOT NULL,
    heartbeat_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(job_id) REFERENCES shazan_jobs_v1(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_job_leases_v1_expiry_idx ON shazan_job_leases_v1(leased_until)`,
  `CREATE TABLE IF NOT EXISTS shazan_job_attempts_v1 (
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
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_job_attempts_v1_job_idx ON shazan_job_attempts_v1(job_id, started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS shazan_job_events_v1 (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(job_id) REFERENCES shazan_jobs_v1(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_job_events_v1_job_idx ON shazan_job_events_v1(job_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS shazan_credit_ledger_v1 (
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
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_credit_ledger_v1_user_idx ON shazan_credit_ledger_v1(user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS shazan_admin_credit_adjustments_v1 (
    id TEXT PRIMARY KEY,
    target_user_id TEXT NOT NULL,
    admin_user_id TEXT NOT NULL,
    delta INTEGER NOT NULL CHECK(delta <> 0),
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(target_user_id) REFERENCES shazan_auth_users_v2(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS shazan_audit_logs_v1 (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    reason TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    ip_hash TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS shazan_audit_logs_v1_created_idx ON shazan_audit_logs_v1(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS shazan_webhook_events_v1 (
    id TEXT PRIMARY KEY,
    provider_key TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    processed_at INTEGER NOT NULL,
    UNIQUE(provider_key, provider_event_id)
  )`,
  `CREATE TRIGGER IF NOT EXISTS shazan_jobs_reserve_v1 AFTER INSERT ON shazan_jobs_v1
    WHEN NEW.status IN ('queued','processing')
    BEGIN
      SELECT CASE WHEN COALESCE((SELECT available FROM shazan_credit_wallets_v1 WHERE user_id = NEW.user_id), -1) < NEW.estimated_credits THEN RAISE(ABORT, 'INSUFFICIENT_CREDITS') END;
      UPDATE shazan_credit_wallets_v1 SET available = available - NEW.estimated_credits, reserved = reserved + NEW.estimated_credits, updated_at = NEW.created_at WHERE user_id = NEW.user_id;
      INSERT INTO shazan_credit_ledger_v1(id,user_id,job_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
        VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,'job:'||NEW.id||':reserve','reserve',-NEW.estimated_credits,NEW.estimated_credits,0,'Workflow job credit reservation',NEW.created_at);
    END`,
  `CREATE TRIGGER IF NOT EXISTS shazan_jobs_charge_v1 AFTER UPDATE OF status ON shazan_jobs_v1
    WHEN NEW.status = 'completed' AND OLD.status <> 'completed'
    BEGIN
      UPDATE shazan_credit_wallets_v1 SET reserved = reserved - NEW.estimated_credits, spent = spent + NEW.estimated_credits, updated_at = NEW.updated_at WHERE user_id = NEW.user_id AND reserved >= NEW.estimated_credits;
      SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'INVALID_CREDIT_RESERVATION') END;
      INSERT OR IGNORE INTO shazan_credit_ledger_v1(id,user_id,job_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
        VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,'job:'||NEW.id||':charge','charge',0,-NEW.estimated_credits,NEW.estimated_credits,'Workflow completed exactly once',NEW.updated_at);
    END`,
  `CREATE TRIGGER IF NOT EXISTS shazan_jobs_refund_v1 AFTER UPDATE OF status ON shazan_jobs_v1
    WHEN NEW.status IN ('failed','cancelled') AND OLD.status IN ('queued','processing')
    BEGIN
      UPDATE shazan_credit_wallets_v1 SET available = available + NEW.estimated_credits, reserved = reserved - NEW.estimated_credits, updated_at = NEW.updated_at WHERE user_id = NEW.user_id AND reserved >= NEW.estimated_credits;
      SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'INVALID_CREDIT_REFUND') END;
      INSERT OR IGNORE INTO shazan_credit_ledger_v1(id,user_id,job_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
        VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,'job:'||NEW.id||':refund','refund',NEW.estimated_credits,-NEW.estimated_credits,0,CASE WHEN NEW.status='cancelled' THEN 'Cancelled job refund' ELSE 'Permanently failed job refund' END,NEW.updated_at);
    END`,
  `CREATE TRIGGER IF NOT EXISTS shazan_admin_credit_apply_v1 AFTER INSERT ON shazan_admin_credit_adjustments_v1
    BEGIN
      SELECT CASE WHEN COALESCE((SELECT available FROM shazan_credit_wallets_v1 WHERE user_id = NEW.target_user_id), -1) + NEW.delta < 0 THEN RAISE(ABORT, 'INSUFFICIENT_CREDITS') END;
      UPDATE shazan_credit_wallets_v1 SET available = available + NEW.delta, updated_at = NEW.created_at WHERE user_id = NEW.target_user_id;
      INSERT INTO shazan_credit_ledger_v1(id,user_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at)
        VALUES(lower(hex(randomblob(16))),NEW.target_user_id,'admin:'||NEW.id,'admin_adjustment',NEW.delta,0,0,NEW.reason,NEW.created_at);
    END`,
];

const schemaReady = new WeakSet();
const encoder = new TextEncoder();

const now = () => Math.floor(Date.now() / 1000);
const id = () => crypto.randomUUID();
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value, max = 200) => typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
const parseJson = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
const base64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const randomToken = (size = 32) => { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return base64Url(bytes); };
const sha256 = async (value) => base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

export const FEATURE_DEFAULTS = Object.freeze({
  PUBLIC_BETA: true,
  ENABLE_DEMO_PROVIDER: true,
  ENABLE_LIVE_PAYMENTS: false,
  ENABLE_COMMUNITY: false,
  ENABLE_GOOGLE_AUTH: true,
  ENABLE_FAL: false,
  ENABLE_KIE: false,
  ENABLE_OPENAI: false,
  ENABLE_GOOGLE_AI: false,
  ENABLE_XAI: false,
  ENABLE_HEYGEN: false,
  ENABLE_RUNWAY: false,
  ENABLE_MUAPI: false,
});

export const RELEASE_LOCKED_OFF = Object.freeze([
  "ENABLE_LIVE_PAYMENTS", "ENABLE_COMMUNITY", "ENABLE_FAL", "ENABLE_KIE", "ENABLE_OPENAI",
  "ENABLE_GOOGLE_AI", "ENABLE_XAI", "ENABLE_HEYGEN", "ENABLE_RUNWAY", "ENABLE_MUAPI",
]);

const PROVIDER_FLAGS = Object.freeze({
  mock: "ENABLE_DEMO_PROVIDER",
  fal: "ENABLE_FAL",
  kie: "ENABLE_KIE",
  openai: "ENABLE_OPENAI",
  google: "ENABLE_GOOGLE_AI",
  xai: "ENABLE_XAI",
  heygen: "ENABLE_HEYGEN",
  runway: "ENABLE_RUNWAY",
  muapi: "ENABLE_MUAPI",
});

const envBoolean = (value) => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  if (normalized === true || normalized === "true" || normalized === "1") return true;
  if (normalized === false || normalized === "false" || normalized === "0") return false;
  return null;
};

export const featureEnabled = async (env, flagKey) => {
  if (!(flagKey in FEATURE_DEFAULTS)) return false;
  if (RELEASE_LOCKED_OFF.includes(flagKey)) return false;
  const override = envBoolean(env?.[flagKey]);
  if (override !== null) return override;
  if (!env?.DB?.prepare) return FEATURE_DEFAULTS[flagKey];
  const row = await env.DB.prepare("SELECT enabled FROM shazan_feature_flags_v1 WHERE flag_key=? LIMIT 1").bind(flagKey).first();
  return row ? Number(row.enabled) === 1 : FEATURE_DEFAULTS[flagKey];
};

const generationRateLimit = async (request, env, userId, limit = 10, windowSeconds = 60) => {
  const timestamp = now();
  const ip = clean(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0] || "unknown", 120);
  const key = await sha256(`workflow-run\0${userId}\0${ip}\0${env.AUTH_PEPPER || "rate-limit"}`);
  const current = await env.DB.prepare("SELECT attempt_count,window_started_at,blocked_until FROM shazan_auth_attempts_v2 WHERE scope_key=? LIMIT 1").bind(key).first();
  if (current && Number(current.blocked_until) > timestamp) return Number(current.blocked_until) - timestamp;
  if (!current || timestamp - Number(current.window_started_at) >= windowSeconds) {
    await env.DB.prepare(`INSERT INTO shazan_auth_attempts_v2(scope_key,attempt_count,window_started_at,blocked_until) VALUES(?,1,?,0)
      ON CONFLICT(scope_key) DO UPDATE SET attempt_count=1,window_started_at=excluded.window_started_at,blocked_until=0`).bind(key, timestamp).run();
    return 0;
  }
  await env.DB.prepare("UPDATE shazan_auth_attempts_v2 SET attempt_count=attempt_count+1,blocked_until=CASE WHEN attempt_count+1>? THEN window_started_at+? ELSE 0 END WHERE scope_key=?")
    .bind(limit, windowSeconds, key).run();
  const updated = await env.DB.prepare("SELECT attempt_count,window_started_at,blocked_until FROM shazan_auth_attempts_v2 WHERE scope_key=? LIMIT 1").bind(key).first();
  return Number(updated?.attempt_count || 0) > limit || Number(updated?.blocked_until || 0) > timestamp ? Math.max(1, Number(updated?.window_started_at || timestamp) + windowSeconds - timestamp) : 0;
};

export const ensureWorkflowSchema = async (db) => {
  if (schemaReady.has(db)) return;
  await db.batch(WORKFLOW_SCHEMA.map((statement) => db.prepare(statement)));
  const timestamp = now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('mock','SHAZAN Mock Provider',1,'mock',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('fal','fal.ai',0,'live',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('kie','Kie.ai',0,'live',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('openai','OpenAI',0,'live',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('google','Google AI',0,'live',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('xai','xAI',0,'live',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('heygen','HeyGen',0,'live',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('runway','Runway',0,'live',?)").bind(timestamp),
    db.prepare("INSERT OR IGNORE INTO shazan_providers_v1(provider_key,display_name,enabled,mode,updated_at) VALUES('muapi','MuAPI',0,'live',?)").bind(timestamp),
    ...Object.entries(FEATURE_DEFAULTS).map(([flagKey, enabled]) => db.prepare("INSERT OR IGNORE INTO shazan_feature_flags_v1(flag_key,enabled,description,updated_at) VALUES(?,?,?,?)")
      .bind(flagKey, enabled ? 1 : 0, `Server-side feature gate: ${flagKey}`, timestamp)),
  ]);
  schemaReady.add(db);
};

const apiError = (ctx, status, error, message = error, details) => ctx.json({ error, message, details }, status);

const readBody = async (request, ctx, maximum = 256 * 1024) => {
  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/json")) return { error: apiError(ctx, 415, "JSON request required") };
  if (Number(request.headers.get("Content-Length") || 0) > maximum) return { error: apiError(ctx, 413, "Request body too large") };
  const text = await request.text();
  if (text.length > maximum) return { error: apiError(ctx, 413, "Request body too large") };
  try {
    const value = JSON.parse(text);
    return isRecord(value) ? { value } : { error: apiError(ctx, 400, "Invalid JSON object") };
  } catch {
    return { error: apiError(ctx, 400, "Invalid JSON request") };
  }
};

const getActor = async (request, env, ctx, requireRole) => {
  await ensureWorkflowSchema(env.DB);
  const session = await ctx.getSession(request, env.DB);
  if (!session) return { error: apiError(ctx, 401, "Authentication required") };
  const userId = session.row.id;
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO shazan_user_profiles_v1(user_id,role,created_at,updated_at) VALUES(?,CASE WHEN ?='admin' THEN 'admin' ELSE 'user' END,?,?)").bind(userId, session.row.role, timestamp, timestamp),
    env.DB.prepare("INSERT OR IGNORE INTO shazan_credit_wallets_v1(user_id,available,reserved,spent,updated_at) VALUES(?,500,0,0,?)").bind(userId, timestamp),
    env.DB.prepare("INSERT OR IGNORE INTO shazan_credit_ledger_v1(id,user_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at) VALUES(?,?,'signup:'||?,'grant',500,0,0,'New account demo credits',?)").bind(id(), userId, userId, timestamp),
  ]);
  const profile = await env.DB.prepare(`SELECT p.role,w.available,w.reserved,w.spent,u.email,u.display_name,u.status
    FROM shazan_user_profiles_v1 p JOIN shazan_credit_wallets_v1 w ON w.user_id=p.user_id
    JOIN shazan_auth_users_v2 u ON u.id=p.user_id WHERE p.user_id=? LIMIT 1`).bind(userId).first();
  if (!profile || profile.status !== "active") return { error: apiError(ctx, 403, "Account unavailable") };
  if (requireRole === "admin" && profile.role !== "admin") return { error: apiError(ctx, 403, "Admin authorization required") };
  return { user: { id: userId, email: profile.email, name: profile.display_name, role: profile.role, wallet: { available: Number(profile.available), reserved: Number(profile.reserved), spent: Number(profile.spent) } } };
};

const ownedProject = async (db, projectId, userId) => db.prepare("SELECT * FROM shazan_projects_v1 WHERE id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1").bind(projectId, userId).first();
const publicProject = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  workflow: parseJson(row.workflow_json, { nodes: [], edges: [] }),
  version: Number(row.current_version),
  created_at: Number(row.created_at),
  updated_at: Number(row.updated_at),
});

const defaultWorkflow = () => ({
  nodes: [
    { id: "prompt-1", type: "text_prompt", position: { x: 80, y: 160 }, data: { prompt: "A cinematic world at golden hour" } },
    { id: "image-1", type: "image_generator", position: { x: 360, y: 160 }, data: { model: "mock-image-v1" } },
    { id: "video-1", type: "image_to_video", position: { x: 640, y: 160 }, data: { model: "mock-video-v1" } },
    { id: "export-1", type: "download_export", position: { x: 920, y: 160 }, data: { format: "json" } },
  ],
  edges: [
    { id: "edge-1", source: "prompt-1", target: "image-1", kind: "text" },
    { id: "edge-2", source: "image-1", target: "video-1", kind: "image" },
    { id: "edge-3", source: "video-1", target: "export-1", kind: "video" },
  ],
});

const listProjects = async (request, env, ctx, actor) => {
  const url = new URL(request.url);
  const { page, limit } = safePagination(url.searchParams);
  const search = clean(url.searchParams.get("q"), 80);
  const pattern = `%${search.replace(/[%_]/g, "")}%`;
  const order = url.searchParams.get("sort") === "name" ? "name COLLATE NOCASE ASC" : "updated_at DESC";
  const where = search ? "AND name LIKE ?" : "";
  const statement = env.DB.prepare(`SELECT id,name,description,current_version,created_at,updated_at FROM shazan_projects_v1 WHERE owner_id=? AND deleted_at IS NULL ${where} ORDER BY ${order} LIMIT ? OFFSET ?`);
  const result = search
    ? await statement.bind(actor.id, pattern, limit, (page - 1) * limit).all()
    : await statement.bind(actor.id, limit, (page - 1) * limit).all();
  return ctx.json({ projects: result.results || [], page, limit });
};

const createProject = async (request, env, ctx, actor) => {
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  const name = clean(body.value.name, 80);
  const description = clean(body.value.description, 500);
  if (name.length < 2) return apiError(ctx, 400, "Project name 2–80 characters required");
  const workflow = body.value.workflow || defaultWorkflow();
  const validation = validateWorkflow(workflow);
  if (!validation.ok) return apiError(ctx, 400, "Invalid workflow", validation.error);
  const canonical = canonicalWorkflow(validation.workflow);
  const hash = await sha256(canonical);
  const projectId = id();
  const versionId = id();
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO shazan_projects_v1(id,owner_id,name,description,workflow_json,workflow_hash,current_version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,1,?,?)`).bind(projectId, actor.id, name, description, canonical, hash, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO shazan_project_versions_v1(id,project_id,version_number,workflow_json,workflow_hash,reason,created_by,created_at)
      VALUES(?,?,1,?,?,?, ?,?)`).bind(versionId, projectId, canonical, hash, "Project created", actor.id, timestamp),
  ]);
  return ctx.json({ project: { id: projectId, name, description, workflow: validation.workflow, version: 1, created_at: timestamp, updated_at: timestamp } }, 201);
};

const getProject = async (env, ctx, actor, projectId) => {
  const row = await ownedProject(env.DB, projectId, actor.id);
  if (!row) return apiError(ctx, 404, "Project not found");
  return ctx.json({ project: publicProject(row) });
};

const updateProjectMeta = async (request, env, ctx, actor, projectId) => {
  const row = await ownedProject(env.DB, projectId, actor.id);
  if (!row) return apiError(ctx, 404, "Project not found");
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  const name = body.value.name === undefined ? row.name : clean(body.value.name, 80);
  const description = body.value.description === undefined ? row.description : clean(body.value.description, 500);
  if (name.length < 2) return apiError(ctx, 400, "Project name 2–80 characters required");
  const timestamp = now();
  await env.DB.prepare("UPDATE shazan_projects_v1 SET name=?,description=?,updated_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL").bind(name, description, timestamp, projectId, actor.id).run();
  return ctx.json({ project: { ...publicProject(row), name, description, updated_at: timestamp } });
};

const saveWorkflow = async (request, env, ctx, actor, projectId) => {
  const row = await ownedProject(env.DB, projectId, actor.id);
  if (!row) return apiError(ctx, 404, "Project not found");
  const body = await readBody(request, ctx, 512 * 1024);
  if (body.error) return body.error;
  const baseVersion = Number(body.value.base_version);
  if (Number.isFinite(baseVersion) && baseVersion !== Number(row.current_version)) {
    return apiError(ctx, 409, "Workflow version conflict", "Project dusre tab mein update hua hai. Latest version reload karein.", { current_version: Number(row.current_version) });
  }
  const validation = validateWorkflow(body.value.workflow);
  if (!validation.ok) return apiError(ctx, 400, "Invalid workflow", validation.error);
  const canonical = canonicalWorkflow(validation.workflow);
  if (canonical.length > 450000) return apiError(ctx, 413, "Workflow too large");
  const hash = await sha256(canonical);
  if (hash === row.workflow_hash) return ctx.json({ project: publicProject(row), unchanged: true });
  const version = Number(row.current_version) + 1;
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE shazan_projects_v1 SET workflow_json=?,workflow_hash=?,current_version=?,updated_at=? WHERE id=? AND owner_id=? AND current_version=?")
      .bind(canonical, hash, version, timestamp, projectId, actor.id, row.current_version),
    env.DB.prepare(`INSERT INTO shazan_project_versions_v1(id,project_id,version_number,workflow_json,workflow_hash,reason,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id(), projectId, version, canonical, hash, clean(body.value.reason, 120) || "Auto-save", actor.id, timestamp),
  ]);
  return ctx.json({ project: { ...publicProject(row), workflow: validation.workflow, version, updated_at: timestamp } });
};

const duplicateProject = async (request, env, ctx, actor, projectId) => {
  const row = await ownedProject(env.DB, projectId, actor.id);
  if (!row) return apiError(ctx, 404, "Project not found");
  const copyId = id();
  const timestamp = now();
  const name = `${row.name} copy`.slice(0, 80);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO shazan_projects_v1(id,owner_id,name,description,workflow_json,workflow_hash,current_version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,1,?,?)`).bind(copyId, actor.id, name, row.description, row.workflow_json, row.workflow_hash, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO shazan_project_versions_v1(id,project_id,version_number,workflow_json,workflow_hash,reason,created_by,created_at)
      VALUES(?,?,1,?,?,?,?,?)`).bind(id(), copyId, row.workflow_json, row.workflow_hash, `Duplicated from ${row.id}`, actor.id, timestamp),
  ]);
  return ctx.json({ project: { id: copyId, name, description: row.description, workflow: parseJson(row.workflow_json), version: 1, created_at: timestamp, updated_at: timestamp } }, 201);
};

const deleteProject = async (env, ctx, actor, projectId) => {
  const timestamp = now();
  const result = await env.DB.prepare("UPDATE shazan_projects_v1 SET deleted_at=?,updated_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL").bind(timestamp, timestamp, projectId, actor.id).run();
  if (!result.meta?.changes) return apiError(ctx, 404, "Project not found");
  return new Response(null, { status: 204 });
};

const listVersions = async (env, ctx, actor, projectId) => {
  if (!await ownedProject(env.DB, projectId, actor.id)) return apiError(ctx, 404, "Project not found");
  const result = await env.DB.prepare("SELECT id,version_number,reason,created_at FROM shazan_project_versions_v1 WHERE project_id=? ORDER BY version_number DESC LIMIT 100").bind(projectId).all();
  return ctx.json({ versions: result.results || [] });
};

const restoreVersion = async (env, ctx, actor, projectId, versionId) => {
  const project = await ownedProject(env.DB, projectId, actor.id);
  if (!project) return apiError(ctx, 404, "Project not found");
  const versionRow = await env.DB.prepare("SELECT * FROM shazan_project_versions_v1 WHERE id=? AND project_id=? LIMIT 1").bind(versionId, projectId).first();
  if (!versionRow) return apiError(ctx, 404, "Version not found");
  const nextVersion = Number(project.current_version) + 1;
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE shazan_projects_v1 SET workflow_json=?,workflow_hash=?,current_version=?,updated_at=? WHERE id=? AND owner_id=?")
      .bind(versionRow.workflow_json, versionRow.workflow_hash, nextVersion, timestamp, projectId, actor.id),
    env.DB.prepare(`INSERT INTO shazan_project_versions_v1(id,project_id,version_number,workflow_json,workflow_hash,reason,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id(), projectId, nextVersion, versionRow.workflow_json, versionRow.workflow_hash, `Restored version ${versionRow.version_number}`, actor.id, timestamp),
  ]);
  return ctx.json({ project: { ...publicProject(project), workflow: parseJson(versionRow.workflow_json), version: nextVersion, updated_at: timestamp } });
};

const createShare = async (request, env, ctx, actor, projectId) => {
  if (!await ownedProject(env.DB, projectId, actor.id)) return apiError(ctx, 404, "Project not found");
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  const days = Math.min(365, Math.max(1, Number(body.value.days) || 30));
  const testSeconds = env.APP_ENV === "test" ? Math.min(60, Math.max(1, Number(body.value.expires_in_seconds) || 0)) : 0;
  const token = randomToken(32);
  const timestamp = now();
  await env.DB.prepare(`INSERT INTO shazan_project_shares_v1(id,project_id,owner_id,token_hash,token_prefix,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?)`).bind(id(), projectId, actor.id, await sha256(token), token.slice(0, 8), timestamp + (testSeconds || days * 86400), timestamp).run();
  const origin = new URL(request.url).origin;
  return ctx.json({ share: { token, url: `${origin}/share?token=${encodeURIComponent(token)}`, expires_at: timestamp + (testSeconds || days * 86400) } }, 201);
};

const revokeShares = async (env, ctx, actor, projectId) => {
  if (!await ownedProject(env.DB, projectId, actor.id)) return apiError(ctx, 404, "Project not found");
  const timestamp = now();
  await env.DB.prepare("UPDATE shazan_project_shares_v1 SET revoked_at=? WHERE project_id=? AND owner_id=? AND revoked_at IS NULL").bind(timestamp, projectId, actor.id).run();
  return ctx.json({ revoked: true });
};

const getSharedProject = async (env, ctx, token) => {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return apiError(ctx, 404, "Share not found");
  const row = await env.DB.prepare(`SELECT p.* FROM shazan_project_shares_v1 s JOIN shazan_projects_v1 p ON p.id=s.project_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>?) AND p.deleted_at IS NULL LIMIT 1`).bind(await sha256(token), now()).first();
  if (!row) return apiError(ctx, 404, "Share not found");
  return ctx.json({ project: publicProject(row), readonly: true });
};

const assetKind = (contentType) => contentType.startsWith("image/") ? "image" : contentType.startsWith("video/") ? "video" : "file";
const allowedUploadType = (value) => new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"]).has(value);
const magicMatches = (bytes, type) => {
  const view = new Uint8Array(bytes.slice(0, 16));
  if (type === "image/png") return view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47;
  if (type === "image/jpeg") return view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff;
  if (type === "image/gif") return String.fromCharCode(...view.slice(0, 3)) === "GIF";
  if (type === "image/webp") return String.fromCharCode(...view.slice(0, 4)) === "RIFF" && String.fromCharCode(...view.slice(8, 12)) === "WEBP";
  if (type.startsWith("video/")) return String.fromCharCode(...view.slice(4, 8)) === "ftyp" || (type === "video/webm" && view[0] === 0x1a && view[1] === 0x45 && view[2] === 0xdf && view[3] === 0xa3);
  return false;
};

const uploadAsset = async (request, env, ctx, actor) => {
  if (!env.MEDIA?.put) return apiError(ctx, 503, "Asset storage unavailable");
  const contentType = (request.headers.get("Content-Type") || "").split(";")[0].toLowerCase();
  if (!allowedUploadType(contentType)) return apiError(ctx, 415, "Unsupported file type");
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 25 * 1024 * 1024) return apiError(ctx, 413, "File must be between 1 byte and 25 MB");
  const projectId = clean(request.headers.get("X-Project-Id"), 80);
  if (projectId && !await ownedProject(env.DB, projectId, actor.id)) return apiError(ctx, 404, "Project not found");
  const filename = sanitizeFilename(request.headers.get("X-File-Name"));
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 25 * 1024 * 1024) return apiError(ctx, 413, "File must be between 1 byte and 25 MB");
  if ((length && bytes.byteLength !== length) || !magicMatches(bytes, contentType)) return apiError(ctx, 400, "File signature does not match content type");
  const assetId = id();
  const key = `users/${actor.id}/${assetId}/${filename}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType, contentDisposition: `inline; filename="${filename.replace(/"/g, "")}"` }, customMetadata: { ownerId: actor.id, assetId } });
  const timestamp = now();
  await env.DB.prepare(`INSERT INTO shazan_assets_v1(id,owner_id,project_id,kind,source,filename,content_type,size_bytes,r2_key,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(assetId, actor.id, projectId || null, assetKind(contentType), "upload", filename, contentType, bytes.byteLength, key, timestamp).run();
  return ctx.json({ asset: { id: assetId, project_id: projectId || null, kind: assetKind(contentType), filename, content_type: contentType, size_bytes: bytes.byteLength, created_at: timestamp, content_url: `/api/v1/assets/${assetId}/content` } }, 201);
};

const listAssets = async (request, env, ctx, actor) => {
  const url = new URL(request.url);
  const { page, limit } = safePagination(url.searchParams);
  const kind = ["image","video","file"].includes(url.searchParams.get("kind")) ? url.searchParams.get("kind") : "";
  const projectId = clean(url.searchParams.get("project_id"), 80);
  const search = clean(url.searchParams.get("q"), 80).replace(/[%_]/g, "");
  const clauses = ["owner_id=?", "deleted_at IS NULL"];
  const bindings = [actor.id];
  if (kind) { clauses.push("kind=?"); bindings.push(kind); }
  if (projectId) { clauses.push("project_id=?"); bindings.push(projectId); }
  if (search) { clauses.push("filename LIKE ?"); bindings.push(`%${search}%`); }
  bindings.push(limit, (page - 1) * limit);
  const result = await env.DB.prepare(`SELECT id,project_id,job_id,kind,source,filename,content_type,size_bytes,metadata_json,created_at FROM shazan_assets_v1 WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings).all();
  return ctx.json({ assets: (result.results || []).map((row) => ({ ...row, metadata: parseJson(row.metadata_json, {}), content_url: `/api/v1/assets/${row.id}/content` })), page, limit });
};

const getAssetContent = async (env, ctx, actor, assetId) => {
  const row = await env.DB.prepare("SELECT * FROM shazan_assets_v1 WHERE id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1").bind(assetId, actor.id).first();
  if (!row) return apiError(ctx, 404, "Asset not found");
  const object = await env.MEDIA.get(row.r2_key);
  if (!object) return apiError(ctx, 404, "Asset data not found");
  const headers = new Headers({ "Content-Type": row.content_type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Disposition", `inline; filename="${sanitizeFilename(row.filename)}"`);
  return new Response(object.body, { headers });
};

const deleteAsset = async (env, ctx, actor, assetId) => {
  const row = await env.DB.prepare("SELECT r2_key FROM shazan_assets_v1 WHERE id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1").bind(assetId, actor.id).first();
  if (!row) return apiError(ctx, 404, "Asset not found");
  await env.MEDIA.delete(row.r2_key);
  await env.DB.prepare("UPDATE shazan_assets_v1 SET deleted_at=? WHERE id=? AND owner_id=?").bind(now(), assetId, actor.id).run();
  return new Response(null, { status: 204 });
};

const jobView = (row) => ({
  id: row.id,
  project_id: row.project_id,
  provider: row.provider_key,
  provider_request_id: row.provider_request_id,
  status: row.status,
  progress: Number(row.progress),
  estimated_credits: Number(row.estimated_credits),
  attempt: Number(row.attempt),
  max_attempts: Number(row.max_attempts),
  result_asset_id: row.result_asset_id,
  result_url: row.result_asset_id ? `/api/v1/assets/${row.result_asset_id}/content` : null,
  error: row.last_error,
  retry_of: row.retry_of,
  created_at: Number(row.created_at),
  updated_at: Number(row.updated_at),
  started_at: row.started_at === null ? null : Number(row.started_at),
  completed_at: row.completed_at === null ? null : Number(row.completed_at),
});

const createJobEvent = (db, jobId, status, progress, message, timestamp = now()) => db.prepare(`INSERT INTO shazan_job_events_v1(id,job_id,status,progress,message,created_at) VALUES(?,?,?,?,?,?)`)
  .bind(id(), jobId, status, progress, clean(message, 500), timestamp);

const createWorkflowRun = async (request, env, ctx, actor, projectId) => {
  const project = await ownedProject(env.DB, projectId, actor.id);
  if (!project) return apiError(ctx, 404, "Project not found");
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  const providerKey = clean(body.value.provider, 40) || "mock";
  const providerFlag = PROVIDER_FLAGS[providerKey];
  if (!providerFlag) return apiError(ctx, 400, "Unknown provider");
  if (!await featureEnabled(env, providerFlag)) return apiError(ctx, 503, "Provider feature disabled", `${providerFlag} is disabled server-side.`);
  const provider = await env.DB.prepare("SELECT * FROM shazan_providers_v1 WHERE provider_key=? LIMIT 1").bind(providerKey).first();
  if (!provider || !provider.enabled) return apiError(ctx, 503, "Provider disabled");
  if (providerKey !== "mock") return apiError(ctx, 501, "Live provider queue pending", "Mock Provider is fully functional. Live adapters require the separate queue consumer deployment.");
  const workflow = parseJson(project.workflow_json);
  const adapter = getProviderAdapter(providerKey);
  if (!adapter) return apiError(ctx, 400, "Unknown provider");
  const configuration = adapter.validateConfiguration?.(env) || { ok: false, error: "Provider configuration cannot be validated" };
  if (!configuration.ok) return apiError(ctx, 503, "Provider configuration unavailable", configuration.error);
  const inputValidation = adapter.validateInput?.({ workflow }) || { ok: false, error: "Provider input cannot be validated" };
  if (!inputValidation.ok) return apiError(ctx, 400, "Invalid provider input", inputValidation.error);
  const cost = adapter.calculateCost(workflow);
  if (!cost.ok) return apiError(ctx, 400, "Invalid workflow", cost.error);
  const headerKey = clean(request.headers.get("Idempotency-Key"), 120);
  const bodyKey = clean(body.value.idempotency_key, 120);
  const idempotencyKey = headerKey || bodyKey;
  if (!/^[a-zA-Z0-9_.:-]{12,120}$/.test(idempotencyKey)) return apiError(ctx, 400, "Idempotency-Key header required");
  const existing = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE user_id=? AND idempotency_key=? LIMIT 1").bind(actor.id, idempotencyKey).first();
  if (existing) return ctx.json({ job: jobView(existing), duplicate: true });
  const retryAfter = await generationRateLimit(request, env, actor.id);
  if (retryAfter) return ctx.json({ error: "Generation rate limit exceeded", message: "Ek minute mein maximum 10 new workflows run kar sakte hain." }, 429, { "Retry-After": String(retryAfter) });
  const timestamp = now();
  const jobId = id();
  const submission = await adapter.submitJob({ jobId, workflow, workflowHash: project.workflow_hash });
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO shazan_jobs_v1(id,user_id,project_id,provider_key,provider_request_id,idempotency_key,workflow_json,workflow_hash,status,progress,estimated_credits,attempt,max_attempts,next_attempt_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?, 'queued',0,?,1,3,?,?,?)`).bind(jobId, actor.id, projectId, providerKey, submission.providerRequestId, idempotencyKey, project.workflow_json, project.workflow_hash, cost.credits, timestamp, timestamp, timestamp),
      createJobEvent(env.DB, jobId, "queued", 0, "Workflow accepted by persistent queue", timestamp),
    ]);
  } catch (error) {
    const message = String(error?.message || error);
    if (/INSUFFICIENT_CREDITS/i.test(message)) return apiError(ctx, 402, "Insufficient credits", "Workflow run ke liye enough available credits nahi hain.", { required: cost.credits, available: actor.wallet.available });
    if (/UNIQUE/i.test(message)) {
      const duplicate = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE user_id=? AND idempotency_key=? LIMIT 1").bind(actor.id, idempotencyKey).first();
      if (duplicate) return ctx.json({ job: jobView(duplicate), duplicate: true });
    }
    throw error;
  }
  if (env.WORKFLOW_QUEUE?.send) {
    try { await env.WORKFLOW_QUEUE.send({ jobId, userId: actor.id, provider: providerKey }, { contentType: "json" }); }
    catch { /* D1 remains the durable source of truth; status polling is the safe fallback. */ }
  }
  const row = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? LIMIT 1").bind(jobId).first();
  return ctx.json({ job: jobView(row), cost: { credits: cost.credits, breakdown: cost.breakdown } }, 202);
};

const mockShouldFail = (job) => /\[fail\]/i.test(job.workflow_json);

const safeAlertEndpoint = (raw) => {
  try {
    const url = new URL(String(raw || ""));
    if (url.protocol !== "https:") return "";
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname)) return "";
    return url.toString();
  } catch { return ""; }
};

export const sendOperationalAlert = async (env, event) => {
  const endpoint = safeAlertEndpoint(env.ALERT_WEBHOOK_URL);
  if (!endpoint) return { sent: false, reason: "ALERT_WEBHOOK_URL missing or unsafe" };
  const normalized = {
    service: "shazan-ai-studio",
    environment: clean(env.APP_ENV, 30) || "production",
    severity: ["info", "warning", "error", "critical"].includes(event?.severity) ? event.severity : "error",
    type: clean(event?.type, 80) || "application_error",
    request_id: clean(event?.request_id, 100) || undefined,
    job_id: clean(event?.job_id, 100) || undefined,
    provider: clean(event?.provider, 40) || undefined,
    status: clean(event?.status, 40) || undefined,
    path: clean(event?.path, 300) || undefined,
    message: clean(event?.message, 500) || "Operational alert",
    occurred_at: new Date().toISOString(),
  };
  const summary = `[${normalized.severity.toUpperCase()}] ${normalized.type}: ${normalized.message}`;
  const headers = { "Content-Type": "application/json", "User-Agent": "SHAZAN-AI-Alerts/1.0" };
  const token = clean(env.ALERT_WEBHOOK_TOKEN, 500);
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ text: summary, content: summary, event: normalized }), redirect: "error" });
    return response.ok ? { sent: true } : { sent: false, reason: `Alert endpoint returned ${response.status}` };
  } catch { return { sent: false, reason: "Alert delivery failed" }; }
};

const finalizeMockJob = async (env, job) => {
  const timestamp = now();
  if (mockShouldFail(job)) {
    if (Number(job.attempt) < Number(job.max_attempts)) {
      const nextAttempt = Number(job.attempt) + 1;
      const delay = retryDelaySeconds(nextAttempt);
      await env.DB.batch([
        env.DB.prepare(`UPDATE shazan_jobs_v1 SET status='queued',progress=0,attempt=?,next_attempt_at=?,started_at=NULL,updated_at=?,last_error=? WHERE id=? AND status='processing'`)
          .bind(nextAttempt, timestamp + delay, timestamp, `Mock failure; automatic retry ${nextAttempt}/${job.max_attempts} in ${delay}s`, job.id),
        createJobEvent(env.DB, job.id, "queued", 0, `Automatic retry ${nextAttempt}/${job.max_attempts} scheduled in ${delay}s`, timestamp),
      ]);
      return;
    }
    await env.DB.batch([
      env.DB.prepare(`UPDATE shazan_jobs_v1 SET status='failed',progress=100,last_error='Mock Provider forced failure after all retries',completed_at=?,updated_at=? WHERE id=? AND status='processing'`).bind(timestamp, timestamp, job.id),
      createJobEvent(env.DB, job.id, "failed", 100, "Mock Provider exhausted retry policy", timestamp),
    ]);
    await sendOperationalAlert(env, { severity: "error", type: "job_permanently_failed", job_id: job.id, provider: job.provider_key, status: "failed", message: "Mock Provider exhausted retry policy" });
    return;
  }

  if (!env.MEDIA?.put) throw new Error("R2 MEDIA binding missing");
  const project = await env.DB.prepare("SELECT name FROM shazan_projects_v1 WHERE id=? LIMIT 1").bind(job.project_id).first();
  const assetId = job.id;
  const filename = `shazan-mock-${job.id}.json`;
  const key = `users/${job.user_id}/generated/${job.id}/${filename}`;
  const manifest = JSON.stringify({
    product: "SHAZAN AI Workflow Studio",
    provider: "mock",
    mode: "demo",
    label: "Demo Output — no paid AI model was called.",
    job_id: job.id,
    project_id: job.project_id,
    project_name: project?.name || "Untitled",
    workflow_hash: job.workflow_hash,
    status: "completed",
    generated_at: new Date(timestamp * 1000).toISOString(),
    note: "Demo Output — no paid AI model was called. Deterministic result used to validate workflow orchestration, persistence and credits.",
  }, null, 2);
  await env.MEDIA.put(key, manifest, { httpMetadata: { contentType: "application/json", contentDisposition: `attachment; filename="${filename}"` }, customMetadata: { ownerId: job.user_id, jobId: job.id, assetId } });
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO shazan_assets_v1(id,owner_id,project_id,job_id,kind,source,filename,content_type,size_bytes,r2_key,metadata_json,created_at)
      VALUES(?,?,?,?, 'file','mock',?,'application/json',?,?,?,?)`).bind(assetId, job.user_id, job.project_id, job.id, filename, encoder.encode(manifest).byteLength, key, JSON.stringify({ provider: "mock", mode: "demo", demo_label: "Demo Output — no paid AI model was called.", workflow_hash: job.workflow_hash }), timestamp),
    env.DB.prepare(`UPDATE shazan_jobs_v1 SET status='completed',progress=100,result_asset_id=?,completed_at=?,updated_at=?,last_error=NULL WHERE id=? AND status='processing'`).bind(assetId, timestamp, timestamp, job.id),
    createJobEvent(env.DB, job.id, "completed", 100, "Mock workflow completed and durable export stored", timestamp),
  ]);
};

export const processPersistentJob = async (env, jobId, userId) => {
  let job = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? AND user_id=? LIMIT 1").bind(jobId, userId).first();
  if (!job || ["completed","failed","cancelled"].includes(job.status)) return job;
  const timestamp = now();
  if (job.status === "queued" && Number(job.next_attempt_at || 0) > timestamp) return job;

  const workerId = id();
  const leaseSeconds = 30;
  const lease = await env.DB.prepare(`INSERT INTO shazan_job_leases_v1(job_id,worker_id,leased_until,heartbeat_at,created_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(job_id) DO UPDATE SET worker_id=excluded.worker_id,leased_until=excluded.leased_until,heartbeat_at=excluded.heartbeat_at
    WHERE shazan_job_leases_v1.leased_until<=?`)
    .bind(jobId, workerId, timestamp + leaseSeconds, timestamp, timestamp, timestamp).run();
  if (Number(lease?.meta?.changes || 0) === 0) return job;

  try {
    if (job.status === "queued") {
      const age = timestamp - Number(job.updated_at);
      const progress = mockProgressForAge(age);
      if (progress.status === "processing") {
        await env.DB.batch([
          env.DB.prepare("UPDATE shazan_jobs_v1 SET status='processing',progress=?,started_at=?,updated_at=? WHERE id=? AND user_id=? AND status='queued'").bind(progress.progress, timestamp, timestamp, jobId, userId),
          createJobEvent(env.DB, jobId, "processing", progress.progress, "Demo Provider executing workflow graph", timestamp),
          env.DB.prepare(`INSERT INTO shazan_job_attempts_v1(id,job_id,attempt_number,worker_id,status,started_at)
            VALUES(?,?,?,?, 'processing',?) ON CONFLICT(job_id,attempt_number) DO UPDATE SET worker_id=excluded.worker_id,status='processing',error_code=NULL,error_message=NULL,finished_at=NULL`)
            .bind(id(), jobId, Number(job.attempt), workerId, timestamp),
        ]);
      } else if (age > 0) {
        await env.DB.prepare("UPDATE shazan_jobs_v1 SET progress=?,updated_at=updated_at WHERE id=? AND user_id=? AND status='queued'").bind(progress.progress, jobId, userId).run();
      }
    }
    job = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? AND user_id=? LIMIT 1").bind(jobId, userId).first();
    if (job?.status === "processing") {
      await env.DB.prepare("UPDATE shazan_job_leases_v1 SET heartbeat_at=?,leased_until=? WHERE job_id=? AND worker_id=?")
        .bind(timestamp, timestamp + leaseSeconds, jobId, workerId).run();
      const age = timestamp - Number(job.started_at || timestamp);
      const progress = Math.min(96, 20 + Math.round(age * 10));
      if (age >= 8) await finalizeMockJob(env, job);
      else await env.DB.prepare("UPDATE shazan_jobs_v1 SET progress=? WHERE id=? AND user_id=? AND status='processing'").bind(progress, jobId, userId).run();
    }
    const latest = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? AND user_id=? LIMIT 1").bind(jobId, userId).first();
    if (latest) {
      const attemptStatus = latest.status === "completed" ? "completed" : latest.status === "failed" ? "failed" : "released";
      await env.DB.prepare("UPDATE shazan_job_attempts_v1 SET status=?,error_code=?,error_message=?,finished_at=? WHERE job_id=? AND attempt_number=?")
        .bind(attemptStatus, latest.status === "failed" ? "DEMO_JOB_FAILED" : null, latest.status === "failed" ? clean(latest.last_error, 500) : null, timestamp, jobId, Number(latest.attempt)).run();
    }
    return latest;
  } finally {
    await env.DB.prepare("DELETE FROM shazan_job_leases_v1 WHERE job_id=? AND worker_id=?").bind(jobId, workerId).run();
  }
};

const listJobs = async (request, env, ctx, actor) => {
  const url = new URL(request.url);
  const { page, limit } = safePagination(url.searchParams);
  const status = ["queued","processing","completed","failed","cancelled"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "";
  const projectId = clean(url.searchParams.get("project_id"), 80);
  const provider = clean(url.searchParams.get("provider"), 40);
  const clauses = ["user_id=?"];
  const bindings = [actor.id];
  if (status) { clauses.push("status=?"); bindings.push(status); }
  if (projectId) { clauses.push("project_id=?"); bindings.push(projectId); }
  if (provider) { clauses.push("provider_key=?"); bindings.push(provider); }
  bindings.push(limit, (page - 1) * limit);
  const result = await env.DB.prepare(`SELECT * FROM shazan_jobs_v1 WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings).all();
  return ctx.json({ jobs: (result.results || []).map(jobView), page, limit });
};

const getJob = async (env, ctx, actor, jobId) => {
  const row = await processPersistentJob(env, jobId, actor.id);
  if (!row) return apiError(ctx, 404, "Job not found");
  const events = await env.DB.prepare("SELECT status,progress,message,created_at FROM shazan_job_events_v1 WHERE job_id=? ORDER BY created_at ASC LIMIT 100").bind(jobId).all();
  return ctx.json({ job: jobView(row), events: events.results || [] });
};

const cancelJob = async (env, ctx, actor, jobId) => {
  const row = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? AND user_id=? LIMIT 1").bind(jobId, actor.id).first();
  if (!row) return apiError(ctx, 404, "Job not found");
  if (!["queued","processing"].includes(row.status)) return apiError(ctx, 409, "Job cannot be cancelled", `Current status: ${row.status}`);
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE shazan_jobs_v1 SET status='cancelled',cancelled_at=?,updated_at=?,last_error='Cancelled by user' WHERE id=? AND user_id=? AND status IN ('queued','processing')").bind(timestamp, timestamp, jobId, actor.id),
    createJobEvent(env.DB, jobId, "cancelled", Number(row.progress), "Cancelled by user; reserved credits refunded", timestamp),
  ]);
  return getJob(env, ctx, actor, jobId);
};

const retryJob = async (request, env, ctx, actor, jobId) => {
  const previous = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? AND user_id=? LIMIT 1").bind(jobId, actor.id).first();
  if (!previous) return apiError(ctx, 404, "Job not found");
  if (!["failed","cancelled"].includes(previous.status)) return apiError(ctx, 409, "Only failed or cancelled jobs can be retried");
  const headerKey = clean(request.headers.get("Idempotency-Key"), 120);
  const idempotencyKey = headerKey || `retry:${jobId}:${id()}`;
  const newId = id();
  const timestamp = now();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO shazan_jobs_v1(id,user_id,project_id,provider_key,provider_request_id,idempotency_key,workflow_json,workflow_hash,status,progress,estimated_credits,attempt,max_attempts,next_attempt_at,retry_of,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?, 'queued',0,?,1,3,?,?,?,?)`).bind(newId, actor.id, previous.project_id, previous.provider_key, `mock_${newId}`, idempotencyKey, previous.workflow_json, previous.workflow_hash, previous.estimated_credits, timestamp, jobId, timestamp, timestamp),
      createJobEvent(env.DB, newId, "queued", 0, `Manual retry of ${jobId}`, timestamp),
    ]);
  } catch (error) {
    if (/INSUFFICIENT_CREDITS/i.test(String(error?.message || error))) return apiError(ctx, 402, "Insufficient credits");
    if (/UNIQUE/i.test(String(error?.message || error))) {
      const duplicate = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE user_id=? AND idempotency_key=? LIMIT 1").bind(actor.id, idempotencyKey).first();
      if (duplicate) return ctx.json({ job: jobView(duplicate), duplicate: true });
    }
    throw error;
  }
  const row = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? LIMIT 1").bind(newId).first();
  return ctx.json({ job: jobView(row) }, 202);
};

const jobEventStream = async (request, env, ctx, actor, jobId) => {
  const exists = await env.DB.prepare("SELECT id FROM shazan_jobs_v1 WHERE id=? AND user_id=? LIMIT 1").bind(jobId, actor.id).first();
  if (!exists) return apiError(ctx, 404, "Job not found");
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => { if (!closed) { closed = true; controller.close(); } };
      request.signal.addEventListener("abort", close, { once: true });
      try {
        for (let index = 0; index < 20 && !closed; index += 1) {
          const row = await processPersistentJob(env, jobId, actor.id);
          if (!row) break;
          controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify(jobView(row))}\n\n`));
          if (["completed","failed","cancelled"].includes(row.status)) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        if (!closed) controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: clean(error?.message, 300) || "Stream failed" })}\n\n`));
      } finally {
        close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
};

const getCredits = async (request, env, ctx, actor) => {
  const url = new URL(request.url);
  const { page, limit } = safePagination(url.searchParams);
  const wallet = await env.DB.prepare("SELECT available,reserved,spent,updated_at FROM shazan_credit_wallets_v1 WHERE user_id=? LIMIT 1").bind(actor.id).first();
  const ledger = await env.DB.prepare("SELECT id,job_id,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at FROM shazan_credit_ledger_v1 WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(actor.id, limit, (page - 1) * limit).all();
  return ctx.json({ wallet, ledger: ledger.results || [], page, limit });
};

const auditStatement = async (request, env, actor, action, targetType, targetId, reason, metadata = {}) => {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const pepper = clean(env.AUTH_PEPPER, 200);
  return env.DB.prepare(`INSERT INTO shazan_audit_logs_v1(id,actor_user_id,action,target_type,target_id,reason,metadata_json,ip_hash,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(id(), actor?.id || null, action, targetType, targetId || null, clean(reason, 500) || null, JSON.stringify(metadata).slice(0, 5000), await sha256(`${ip}\u0000${pepper}`), now());
};

const adminMetrics = async (env, ctx) => {
  const since = now() - 30 * 86400;
  const results = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS value FROM shazan_auth_users_v2"),
    env.DB.prepare("SELECT COUNT(*) AS value FROM shazan_auth_users_v2 WHERE last_login_at>=?").bind(since),
    env.DB.prepare("SELECT COUNT(*) AS value FROM shazan_jobs_v1"),
    env.DB.prepare("SELECT status,COUNT(*) AS count FROM shazan_jobs_v1 GROUP BY status"),
    env.DB.prepare("SELECT provider_key,COUNT(*) AS jobs,SUM(CASE WHEN status='completed' THEN estimated_credits ELSE 0 END) AS charged_credits FROM shazan_jobs_v1 GROUP BY provider_key"),
    env.DB.prepare("SELECT id,provider_key,last_error,updated_at FROM shazan_jobs_v1 WHERE status='failed' ORDER BY updated_at DESC LIMIT 20"),
  ]);
  const statusRows = results[3]?.results || [];
  const statusMap = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count)]));
  const total = Number(results[2]?.results?.[0]?.value || 0);
  const completed = statusMap.completed || 0;
  const failed = statusMap.failed || 0;
  return ctx.json({
    totals: { users: Number(results[0]?.results?.[0]?.value || 0), active_users_30d: Number(results[1]?.results?.[0]?.value || 0), generations: total },
    jobs_by_status: statusMap,
    success_rate: completed + failed ? Number(((completed / (completed + failed)) * 100).toFixed(2)) : 0,
    failure_rate: completed + failed ? Number(((failed / (completed + failed)) * 100).toFixed(2)) : 0,
    providers: results[4]?.results || [],
    recent_errors: results[5]?.results || [],
  });
};

const adminUsers = async (request, env, ctx) => {
  const url = new URL(request.url);
  const { page, limit } = safePagination(url.searchParams);
  const search = clean(url.searchParams.get("q"), 80).replace(/[%_]/g, "");
  const where = search ? "WHERE u.email LIKE ? OR u.display_name LIKE ?" : "";
  const statement = env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.status,u.email_verified,u.created_at,u.last_login_at,
    COALESCE(p.role,u.role) AS role,COALESCE(w.available,0) AS available,COALESCE(w.reserved,0) AS reserved,COALESCE(w.spent,0) AS spent
    FROM shazan_auth_users_v2 u LEFT JOIN shazan_user_profiles_v1 p ON p.user_id=u.id LEFT JOIN shazan_credit_wallets_v1 w ON w.user_id=u.id
    ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`);
  const result = search ? await statement.bind(`%${search}%`, `%${search}%`, limit, (page - 1) * limit).all() : await statement.bind(limit, (page - 1) * limit).all();
  return ctx.json({ users: result.results || [], page, limit });
};

const adminUpdateUser = async (request, env, ctx, actor, userId) => {
  const target = await env.DB.prepare("SELECT id,status FROM shazan_auth_users_v2 WHERE id=? LIMIT 1").bind(userId).first();
  if (!target) return apiError(ctx, 404, "User not found");
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  const role = ["user","creator","admin"].includes(body.value.role) ? body.value.role : null;
  const status = ["active","suspended"].includes(body.value.status) ? body.value.status : null;
  const reason = clean(body.value.reason, 500);
  if ((!role && !status) || reason.length < 5) return apiError(ctx, 400, "Valid role/status and mandatory reason required");
  if (actor.id === userId && status === "suspended") return apiError(ctx, 409, "Admin cannot suspend own account");
  const timestamp = now();
  const statements = [];
  if (role) statements.push(env.DB.prepare("INSERT INTO shazan_user_profiles_v1(user_id,role,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at").bind(userId, role, timestamp, timestamp));
  if (status) statements.push(env.DB.prepare("UPDATE shazan_auth_users_v2 SET status=?,updated_at=? WHERE id=?").bind(status, timestamp, userId));
  statements.push(await auditStatement(request, env, actor, "user.update", "user", userId, reason, { role, status }));
  await env.DB.batch(statements);
  return ctx.json({ updated: true, user_id: userId, role, status });
};

const adminAdjustCredits = async (request, env, ctx, actor, userId) => {
  const target = await env.DB.prepare("SELECT id FROM shazan_auth_users_v2 WHERE id=? LIMIT 1").bind(userId).first();
  if (!target) return apiError(ctx, 404, "User not found");
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  const delta = Math.trunc(Number(body.value.delta));
  const reason = clean(body.value.reason, 500);
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 100000 || reason.length < 5) return apiError(ctx, 400, "Non-zero credit delta and mandatory reason required");
  const timestamp = now();
  const adjustmentId = id();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO shazan_admin_credit_adjustments_v1(id,target_user_id,admin_user_id,delta,reason,created_at) VALUES(?,?,?,?,?,?)").bind(adjustmentId, userId, actor.id, delta, reason, timestamp),
      await auditStatement(request, env, actor, "credits.adjust", "user", userId, reason, { delta, adjustment_id: adjustmentId }),
    ]);
  } catch (error) {
    if (/INSUFFICIENT_CREDITS/i.test(String(error?.message || error))) return apiError(ctx, 409, "Adjustment would create a negative balance");
    throw error;
  }
  const wallet = await env.DB.prepare("SELECT available,reserved,spent,updated_at FROM shazan_credit_wallets_v1 WHERE user_id=? LIMIT 1").bind(userId).first();
  return ctx.json({ adjustment_id: adjustmentId, wallet });
};

const listProviders = async (env, ctx) => {
  const result = await env.DB.prepare("SELECT provider_key,display_name,enabled,mode,updated_at FROM shazan_providers_v1 ORDER BY display_name").all();
  const providers = await Promise.all((result.results || []).map(async (provider) => ({
    ...provider,
    effective_enabled: Boolean(provider.enabled) && await featureEnabled(env, PROVIDER_FLAGS[provider.provider_key]),
    feature_flag: PROVIDER_FLAGS[provider.provider_key] || null,
  })));
  return ctx.json({ providers });
};

const featureSnapshot = async (env) => Object.fromEntries(await Promise.all(Object.keys(FEATURE_DEFAULTS).map(async (flagKey) => [flagKey, await featureEnabled(env, flagKey)])));

const listFeatures = async (env, ctx) => ctx.json({ features: await featureSnapshot(env) });

const adminFeatureFlags = async (env, ctx) => {
  const rows = await env.DB.prepare("SELECT flag_key,enabled,description,updated_by,updated_at FROM shazan_feature_flags_v1 ORDER BY flag_key").all();
  const flags = await Promise.all((rows.results || []).map(async (row) => ({
    ...row,
    effective_enabled: await featureEnabled(env, row.flag_key),
    environment_locked: RELEASE_LOCKED_OFF.includes(row.flag_key) || envBoolean(env[row.flag_key]) !== null,
  })));
  return ctx.json({ flags });
};

const adminUpdateFeature = async (request, env, ctx, actor, flagKey) => {
  if (!(flagKey in FEATURE_DEFAULTS)) return apiError(ctx, 404, "Feature flag not found");
  if (RELEASE_LOCKED_OFF.includes(flagKey)) return apiError(ctx, 409, "Feature is release-locked off", `${flagKey} requires a reviewed code release; it cannot be enabled from the database or admin API.`);
  if (envBoolean(env[flagKey]) !== null) return apiError(ctx, 409, "Feature flag controlled by environment", `${flagKey} must be changed in Cloudflare environment configuration.`);
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  if (typeof body.value.enabled !== "boolean") return apiError(ctx, 400, "Boolean enabled required");
  const reason = clean(body.value.reason, 500);
  if (reason.length < 5) return apiError(ctx, 400, "Mandatory reason required");
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE shazan_feature_flags_v1 SET enabled=?,updated_by=?,updated_at=? WHERE flag_key=?").bind(body.value.enabled ? 1 : 0, actor.id, timestamp, flagKey),
    await auditStatement(request, env, actor, "feature.toggle", "feature_flag", flagKey, reason, { enabled: body.value.enabled }),
  ]);
  return ctx.json({ flag: { flag_key: flagKey, enabled: body.value.enabled, effective_enabled: body.value.enabled, updated_at: timestamp } });
};

const adminUpdateProvider = async (request, env, ctx, actor, providerKey) => {
  const current = await env.DB.prepare("SELECT * FROM shazan_providers_v1 WHERE provider_key=? LIMIT 1").bind(providerKey).first();
  if (!current) return apiError(ctx, 404, "Provider not found");
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  if (typeof body.value.enabled !== "boolean") return apiError(ctx, 400, "Boolean enabled required");
  const reason = clean(body.value.reason, 500);
  if (reason.length < 5) return apiError(ctx, 400, "Mandatory reason required");
  if (body.value.enabled) {
    const flagKey = PROVIDER_FLAGS[providerKey];
    if (!flagKey || !await featureEnabled(env, flagKey)) return apiError(ctx, 409, "Provider feature flag disabled", flagKey ? `Enable ${flagKey} first.` : "Provider has no server feature gate.");
    const adapter = getProviderAdapter(providerKey);
    const configuration = adapter?.validateConfiguration?.(env);
    if (!configuration?.ok) return apiError(ctx, 409, "Provider staging verification incomplete", configuration?.error || "Provider adapter is not production-configured.");
  }
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE shazan_providers_v1 SET enabled=?,updated_by=?,updated_at=? WHERE provider_key=?").bind(body.value.enabled ? 1 : 0, actor.id, timestamp, providerKey),
    await auditStatement(request, env, actor, "provider.toggle", "provider", providerKey, reason, { enabled: body.value.enabled }),
  ]);
  return ctx.json({ provider: { ...current, enabled: body.value.enabled ? 1 : 0, updated_at: timestamp } });
};

const adminAuditLogs = async (request, env, ctx) => {
  const url = new URL(request.url);
  const { page, limit } = safePagination(url.searchParams);
  const action = clean(url.searchParams.get("action"), 80);
  const result = action
    ? await env.DB.prepare("SELECT * FROM shazan_audit_logs_v1 WHERE action=? ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(action, limit, (page - 1) * limit).all()
    : await env.DB.prepare("SELECT * FROM shazan_audit_logs_v1 ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(limit, (page - 1) * limit).all();
  return ctx.json({ logs: (result.results || []).map((row) => ({ ...row, metadata: parseJson(row.metadata_json, {}) })), page, limit });
};

const webhook = async (request, env, ctx, providerKey) => {
  const configured = clean(env.WEBHOOK_SECRET, 300);
  const received = clean(request.headers.get("X-Webhook-Secret"), 300);
  if (configured.length < 32 || received.length !== configured.length || await sha256(received) !== await sha256(configured)) return apiError(ctx, 401, "Invalid webhook signature");
  const body = await readBody(request, ctx);
  if (body.error) return body.error;
  const eventId = clean(body.value.event_id, 160);
  const jobId = clean(body.value.job_id, 80);
  const status = clean(body.value.status, 30);
  if (!eventId || !jobId || !["processing","completed","failed","cancelled"].includes(status)) return apiError(ctx, 400, "Invalid webhook event");
  const hash = await sha256(JSON.stringify(body.value));
  const timestamp = now();
  try {
    await env.DB.prepare("INSERT INTO shazan_webhook_events_v1(id,provider_key,provider_event_id,payload_hash,processed_at) VALUES(?,?,?,?,?)").bind(id(), providerKey, eventId, hash, timestamp).run();
  } catch (error) {
    if (/UNIQUE/i.test(String(error?.message || error))) return ctx.json({ accepted: true, duplicate: true });
    throw error;
  }
  const job = await env.DB.prepare("SELECT * FROM shazan_jobs_v1 WHERE id=? AND provider_key=? LIMIT 1").bind(jobId, providerKey).first();
  if (!job) return apiError(ctx, 404, "Job not found");
  if (!canTransitionJob(job.status, status)) return ctx.json({ accepted: true, ignored: true, current_status: job.status });
  const progress = status === "completed" || status === "failed" ? 100 : Math.min(99, Math.max(Number(job.progress), Number(body.value.progress) || 20));
  await env.DB.batch([
    env.DB.prepare("UPDATE shazan_jobs_v1 SET status=?,progress=?,last_error=?,completed_at=CASE WHEN ? IN ('completed','failed') THEN ? ELSE completed_at END,updated_at=? WHERE id=? AND status=?")
      .bind(status, progress, status === "failed" ? clean(body.value.error, 500) || "Provider failed" : null, status, timestamp, timestamp, jobId, job.status),
    createJobEvent(env.DB, jobId, status, progress, clean(body.value.message, 500) || `Provider webhook: ${status}`, timestamp),
  ]);
  return ctx.json({ accepted: true, duplicate: false });
};

const healthState = async (env) => {
  await ensureWorkflowSchema(env.DB);
  const db = await env.DB.prepare("SELECT 1 AS ok").first();
  const mockRecord = await env.DB.prepare("SELECT enabled FROM shazan_providers_v1 WHERE provider_key='mock' LIMIT 1").first();
  const demoEnabled = await featureEnabled(env, "ENABLE_DEMO_PROVIDER");
  const livePayments = await featureEnabled(env, "ENABLE_LIVE_PAYMENTS");
  const database = db?.ok === 1;
  const assetStorage = Boolean(env.MEDIA?.put && env.MEDIA?.get);
  const mockProvider = demoEnabled && Number(mockRecord?.enabled) === 1;
  const authSecurity = clean(env.AUTH_PEPPER, 500).length >= 32;
  const production = !["test", "development", "local"].includes(clean(env.APP_ENV, 30).toLowerCase());
  const queueReady = Boolean(env.WORKFLOW_QUEUE?.send);
  const googleConfigured = await featureEnabled(env, "ENABLE_GOOGLE_AUTH") && Boolean(clean(env.GOOGLE_CLIENT_ID, 500) && clean(env.GOOGLE_CLIENT_SECRET, 500));
  const emailConfigured = Boolean(clean(env.RESEND_API_KEY, 500) && clean(env.AUTH_EMAIL_FROM, 500));
  const alertsConfigured = Boolean(safeAlertEndpoint(env.ALERT_WEBHOOK_URL));
  const paidFeaturesClosed = !(await featureEnabled(env, "ENABLE_LIVE_PAYMENTS"))
    && !(await featureEnabled(env, "ENABLE_COMMUNITY"))
    && await Promise.all(["ENABLE_FAL","ENABLE_KIE","ENABLE_OPENAI","ENABLE_GOOGLE_AI","ENABLE_XAI","ENABLE_HEYGEN","ENABLE_RUNWAY","ENABLE_MUAPI"].map((flag) => featureEnabled(env, flag))).then((states) => states.every((state) => !state));
  const coreReady = database && assetStorage && mockProvider && authSecurity && paidFeaturesClosed;
  const launchGates = { cloudflare_queue: queueReady, google_oauth: googleConfigured, transactional_email: emailConfigured, operational_alerts: alertsConfigured, paid_features_closed: paidFeaturesClosed };
  const ready = coreReady && (!production || Object.values(launchGates).every(Boolean));
  return {
    status: ready ? "ok" : "degraded",
    service: "SHAZAN AI Workflow Studio",
    version: "workflow-v1.1",
    release_mode: "public_beta",
    database,
    asset_storage: assetStorage,
    environment: production ? "production" : clean(env.APP_ENV, 30) || "local",
    core_ready: coreReady,
    launch_gates: launchGates,
    job_queue: queueReady ? "cloudflare_queue" : "durable_d1_fallback",
    mock_provider: mockProvider,
    authentication: authSecurity,
    google_auth: googleConfigured,
    email_delivery: emailConfigured,
    error_alerts: alertsConfigured,
    live_payments: livePayments ? "configuration_required" : "disabled",
    ready,
    timestamp: new Date().toISOString(),
  };
};

const health = async (env, ctx, readiness = false) => {
  const state = await healthState(env);
  const payload = readiness ? { ready: state.ready, ...state } : state;
  return ctx.json(payload, readiness && !state.ready ? 503 : state.core_ready ? 200 : 503);
};

export const handleWorkflowApi = async (request, env, pathname, ctx) => {
  if (!env.DB?.prepare) return apiError(ctx, 503, "Database binding unavailable");
  try {
    await ensureWorkflowSchema(env.DB);
    const segments = pathname.slice("/api/v1/".length).split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (segments[0] === "health" && segments.length === 1 && request.method === "GET") return health(env, ctx);
    if (segments[0] === "health" && segments[1] === "ready" && request.method === "GET") return health(env, ctx, true);
    if (segments[0] === "features" && request.method === "GET") return listFeatures(env, ctx);
    if (segments[0] === "share" && segments[1] && request.method === "GET") return getSharedProject(env, ctx, segments[1]);
    if (segments[0] === "webhooks" && segments[1] && request.method === "POST") return webhook(request, env, ctx, segments[1]);
    if (!["GET", "HEAD"].includes(request.method)) {
      const originError = ctx.sameOriginMutationError(request);
      if (originError) return originError;
    }

    const auth = await getActor(request, env, ctx, segments[0] === "admin" ? "admin" : undefined);
    if (auth.error) return auth.error;
    const actor = auth.user;

    if (segments[0] === "providers" && request.method === "GET") return listProviders(env, ctx);
    if (segments[0] === "credits" && request.method === "GET") return getCredits(request, env, ctx, actor);
    if (segments[0] === "projects" && segments.length === 1) {
      if (request.method === "GET") return listProjects(request, env, ctx, actor);
      if (request.method === "POST") return createProject(request, env, ctx, actor);
    }
    if (segments[0] === "projects" && segments[1]) {
      const projectId = segments[1];
      if (segments.length === 2) {
        if (request.method === "GET") return getProject(env, ctx, actor, projectId);
        if (request.method === "PATCH") return updateProjectMeta(request, env, ctx, actor, projectId);
        if (request.method === "DELETE") return deleteProject(env, ctx, actor, projectId);
      }
      if (segments[2] === "workflow" && request.method === "PUT") return saveWorkflow(request, env, ctx, actor, projectId);
      if (segments[2] === "duplicate" && request.method === "POST") return duplicateProject(request, env, ctx, actor, projectId);
      if (segments[2] === "versions" && segments.length === 3 && request.method === "GET") return listVersions(env, ctx, actor, projectId);
      if (segments[2] === "versions" && segments[3] && segments[4] === "restore" && request.method === "POST") return restoreVersion(env, ctx, actor, projectId, segments[3]);
      if (segments[2] === "share" && request.method === "POST") return createShare(request, env, ctx, actor, projectId);
      if (segments[2] === "share" && request.method === "DELETE") return revokeShares(env, ctx, actor, projectId);
      if (segments[2] === "runs" && request.method === "POST") return createWorkflowRun(request, env, ctx, actor, projectId);
    }
    if (segments[0] === "assets") {
      if (segments.length === 1 && request.method === "GET") return listAssets(request, env, ctx, actor);
      if (segments.length === 1 && request.method === "POST") return uploadAsset(request, env, ctx, actor);
      if (segments[1] && segments[2] === "content" && request.method === "GET") return getAssetContent(env, ctx, actor, segments[1]);
      if (segments[1] && segments.length === 2 && request.method === "DELETE") return deleteAsset(env, ctx, actor, segments[1]);
    }
    if (segments[0] === "jobs") {
      if (segments.length === 1 && request.method === "GET") return listJobs(request, env, ctx, actor);
      if (segments[1] && segments.length === 2 && request.method === "GET") return getJob(env, ctx, actor, segments[1]);
      if (segments[1] && segments[2] === "events" && request.method === "GET") return jobEventStream(request, env, ctx, actor, segments[1]);
      if (segments[1] && segments[2] === "cancel" && request.method === "POST") return cancelJob(env, ctx, actor, segments[1]);
      if (segments[1] && segments[2] === "retry" && request.method === "POST") return retryJob(request, env, ctx, actor, segments[1]);
    }
    if (segments[0] === "admin") {
      if (segments[1] === "metrics" && request.method === "GET") return adminMetrics(env, ctx);
      if (segments[1] === "users" && segments.length === 2 && request.method === "GET") return adminUsers(request, env, ctx);
      if (segments[1] === "users" && segments[2] && segments.length === 3 && request.method === "PATCH") return adminUpdateUser(request, env, ctx, actor, segments[2]);
      if (segments[1] === "users" && segments[2] && segments[3] === "credits" && request.method === "POST") return adminAdjustCredits(request, env, ctx, actor, segments[2]);
      if (segments[1] === "providers" && segments[2] && request.method === "PATCH") return adminUpdateProvider(request, env, ctx, actor, segments[2]);
      if (segments[1] === "features" && segments.length === 2 && request.method === "GET") return adminFeatureFlags(env, ctx);
      if (segments[1] === "features" && segments[2] && request.method === "PATCH") return adminUpdateFeature(request, env, ctx, actor, segments[2]);
      if (segments[1] === "audit" && request.method === "GET") return adminAuditLogs(request, env, ctx);
    }
    return apiError(ctx, 404, "API route not found");
  } catch (error) {
    return apiError(ctx, 500, "Workflow service unavailable", clean(error?.message, 500) || "Unexpected workflow service error");
  }
};
