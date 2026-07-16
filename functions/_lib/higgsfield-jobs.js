import { WalletError } from './wallet.js';

const TABLE = 'ai_higgsfield_jobs_v1';
let schemaPromise;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    request_json TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    provider_job_id TEXT,
    output_url TEXT,
    result_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS ai_higgsfield_jobs_user_created_v1 ON ${TABLE}(user_id, created_at DESC)`,
];

export async function ensureHiggsfieldJobsSchema(db) {
  if (!db) throw new WalletError('higgsfield_database_missing', 'Bind the D1 database as DB.', 503);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const statement of SCHEMA) await db.prepare(statement).run();
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

function safeJson(value) {
  try { return JSON.stringify(value).slice(0, 120000); } catch { return null; }
}

export async function createHiggsfieldJob(db, job) {
  await ensureHiggsfieldJobsSchema(db);
  await db.prepare(
    `INSERT INTO ${TABLE}
     (id, user_id, kind, tool_name, model, prompt, request_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'running')`,
  ).bind(job.id, job.userId, job.kind, job.toolName, job.model, job.prompt, safeJson(job.request)).run();
}

export async function updateHiggsfieldJob(db, id, userId, patch) {
  await ensureHiggsfieldJobsSchema(db);
  await db.prepare(
    `UPDATE ${TABLE} SET
      status = COALESCE(?, status),
      provider_job_id = COALESCE(?, provider_job_id),
      output_url = COALESCE(?, output_url),
      result_json = COALESCE(?, result_json),
      error_message = COALESCE(?, error_message),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  ).bind(
    patch.status || null,
    patch.providerJobId || null,
    patch.outputUrl || null,
    patch.result === undefined ? null : safeJson(patch.result),
    patch.errorMessage || null,
    id,
    userId,
  ).run();
  return getHiggsfieldJob(db, id, userId);
}

export async function getHiggsfieldJob(db, id, userId) {
  await ensureHiggsfieldJobsSchema(db);
  const row = await db.prepare(
    `SELECT id, kind, tool_name, model, prompt, status, provider_job_id, output_url,
            error_message, created_at, updated_at
     FROM ${TABLE} WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first();
  if (!row) throw new WalletError('generation_not_found', 'Generation not found.', 404);
  return normalizeJob(row);
}

export async function listHiggsfieldJobs(db, userId, limit = 30) {
  await ensureHiggsfieldJobsSchema(db);
  const result = await db.prepare(
    `SELECT id, kind, tool_name, model, prompt, status, provider_job_id, output_url,
            error_message, created_at, updated_at
     FROM ${TABLE} WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).bind(userId, Math.min(100, Math.max(1, Number(limit) || 30))).all();
  return (result.results || []).map(normalizeJob);
}

function normalizeJob(row) {
  return {
    id: row.id,
    kind: row.kind,
    toolName: row.tool_name,
    model: row.model,
    prompt: row.prompt,
    status: row.status,
    providerJobId: row.provider_job_id,
    outputUrl: row.output_url,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
