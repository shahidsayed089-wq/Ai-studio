const SESSION_COOKIE = 'ai_studio_session';
const ONE_YEAR = 60 * 60 * 24 * 365;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_charges (
  id TEXT PRIMARY KEY,
  provider_task_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  quoted_cost INTEGER NOT NULL CHECK (quoted_cost > 0),
  reserved_cost INTEGER NOT NULL CHECK (reserved_cost > 0),
  provider_cost INTEGER,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','refunded')),
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES wallets(user_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup','reserve','capture','refund','adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reserved_after INTEGER NOT NULL,
  reference_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES wallets(user_id)
);

CREATE TABLE IF NOT EXISTS wallet_topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES wallets(user_id)
);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_created
  ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_charges_user_created
  ON generation_charges(user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS generation_reserve_guard
BEFORE INSERT ON generation_charges
BEGIN
  SELECT CASE
    WHEN COALESCE((SELECT balance FROM wallets WHERE user_id = NEW.user_id), -1) < NEW.reserved_cost
    THEN RAISE(ABORT, 'insufficient_wallet_credits')
  END;
END;

CREATE TRIGGER IF NOT EXISTS generation_reserve_apply
AFTER INSERT ON generation_charges
BEGIN
  UPDATE wallets
  SET balance = balance - NEW.reserved_cost,
      reserved = reserved + NEW.reserved_cost,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;

  INSERT INTO wallet_transactions (
    id, user_id, type, amount, balance_after, reserved_after, reference_id, note
  )
  SELECT lower(hex(randomblob(16))), NEW.user_id, 'reserve', -NEW.reserved_cost,
         balance, reserved, NEW.id, 'Generation credits reserved'
  FROM wallets WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS generation_refund_apply
AFTER UPDATE OF status ON generation_charges
WHEN OLD.status = 'reserved' AND NEW.status = 'refunded'
BEGIN
  UPDATE wallets
  SET balance = balance + OLD.reserved_cost,
      reserved = MAX(0, reserved - OLD.reserved_cost),
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;

  INSERT INTO wallet_transactions (
    id, user_id, type, amount, balance_after, reserved_after, reference_id, note
  )
  SELECT lower(hex(randomblob(16))), OLD.user_id, 'refund', OLD.reserved_cost,
         balance, reserved, OLD.id, 'Failed generation refunded'
  FROM wallets WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER IF NOT EXISTS generation_capture_apply
AFTER UPDATE OF status ON generation_charges
WHEN OLD.status = 'reserved' AND NEW.status = 'completed'
BEGIN
  UPDATE wallets
  SET reserved = MAX(0, reserved - OLD.reserved_cost),
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;

  INSERT INTO wallet_transactions (
    id, user_id, type, amount, balance_after, reserved_after, reference_id, note
  )
  SELECT lower(hex(randomblob(16))), OLD.user_id, 'capture', 0,
         balance, reserved, OLD.id, 'Generation completed and charge captured'
  FROM wallets WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER IF NOT EXISTS wallet_topup_apply
AFTER INSERT ON wallet_topups
BEGIN
  UPDATE wallets
  SET balance = balance + NEW.amount,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;

  INSERT INTO wallet_transactions (
    id, user_id, type, amount, balance_after, reserved_after, reference_id, note
  )
  SELECT lower(hex(randomblob(16))), NEW.user_id, 'topup', NEW.amount,
         balance, reserved, NEW.id, COALESCE(NEW.note, 'Wallet top-up')
  FROM wallets WHERE user_id = NEW.user_id;
END;
`;

let schemaPromise;

export class WalletError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  return Object.fromEntries(
    header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const index = part.indexOf('=');
      return index < 0 ? [part, ''] : [part.slice(0, index), decodeCookieValue(part.slice(index + 1))];
    }),
  );
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

export async function ensureWalletSchema(db) {
  if (!db) throw new WalletError('wallet_database_missing', 'Bind a Cloudflare D1 database as DB.', 503);
  if (!schemaPromise) {
    schemaPromise = db.exec(SCHEMA).catch(error => {
      schemaPromise = undefined;
      console.error('wallet_schema_init_failed', String(error?.message || error));
      throw new WalletError(
        'wallet_schema_init_failed',
        'The D1 database is connected, but the wallet schema could not be initialized.',
        503,
      );
    });
  }
  await schemaPromise;
}

export async function resolveWalletUser(request, env) {
  const accessEmail = (request.headers.get('cf-access-authenticated-user-email') || '').trim().toLowerCase();
  if (accessEmail) {
    return { userId: `email:${await digest(accessEmail)}`, setCookie: null, authenticated: true };
  }

  const secret = typeof env.SESSION_SIGNING_KEY === 'string' ? env.SESSION_SIGNING_KEY.trim() : '';
  if (secret.length < 24) {
    throw new WalletError(
      'wallet_session_not_configured',
      'SESSION_SIGNING_KEY must be configured as a secret with at least 24 characters.',
      503,
    );
  }

  const stored = parseCookies(request)[SESSION_COOKIE] || '';
  const separator = stored.lastIndexOf('.');
  if (separator > 0) {
    const id = stored.slice(0, separator);
    const signature = stored.slice(separator + 1);
    if (/^[a-f0-9-]{36}$/i.test(id)) {
      const expected = await sign(id, secret);
      if (safeEqual(signature, expected)) {
        return { userId: `anon:${id}`, setCookie: null, authenticated: false };
      }
    }
  }

  const id = crypto.randomUUID();
  const signature = await sign(id, secret);
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(`${id}.${signature}`)}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`;
  return { userId: `anon:${id}`, setCookie: cookie, authenticated: false };
}

export async function ensureWallet(db, userId) {
  await ensureWalletSchema(db);
  await db.prepare(
    'INSERT OR IGNORE INTO wallets (user_id, balance, reserved) VALUES (?, 0, 0)',
  ).bind(userId).run();
}

export async function readWallet(db, userId, ledgerLimit = 20) {
  await ensureWallet(db, userId);
  const wallet = await db.prepare(
    'SELECT user_id, balance, reserved, created_at, updated_at FROM wallets WHERE user_id = ?',
  ).bind(userId).first();
  const ledger = await db.prepare(
    `SELECT id, type, amount, balance_after, reserved_after, reference_id, note, created_at
     FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).bind(userId, Math.min(100, Math.max(1, ledgerLimit))).all();
  return { wallet, ledger: ledger.results || [] };
}

export async function reserveGeneration(db, { userId, provider, model, cost, metadata }) {
  await ensureWallet(db, userId);
  const amount = Math.max(1, Math.round(Number(cost) || 0));
  const chargeId = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO generation_charges
       (id, user_id, provider, model, quoted_cost, reserved_cost, status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)`,
    ).bind(chargeId, userId, provider, model, amount, amount, JSON.stringify(metadata || {})).run();
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('insufficient_wallet_credits')) {
      const state = await readWallet(db, userId, 1);
      throw new WalletError(
        'insufficient_wallet_credits',
        `This render needs ${amount} credits, but the wallet has ${state.wallet?.balance ?? 0}.`,
        402,
        { requiredCredits: amount, availableCredits: state.wallet?.balance ?? 0 },
      );
    }
    throw error;
  }
  return { chargeId, cost: amount, ...(await readWallet(db, userId, 10)) };
}

export async function attachProviderTask(db, chargeId, providerTaskId, providerCost = null) {
  await db.prepare(
    `UPDATE generation_charges
     SET provider_task_id = ?, provider_cost = COALESCE(?, provider_cost), updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'reserved'`,
  ).bind(providerTaskId, providerCost, chargeId).run();
}

export async function refundCharge(db, chargeId) {
  await db.prepare(
    `UPDATE generation_charges SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'reserved'`,
  ).bind(chargeId).run();
}

export async function finalizeTask(db, userId, providerTaskId, status, providerCost = null) {
  await ensureWallet(db, userId);
  const nextStatus = status === 'completed' ? 'completed' : status === 'failed' ? 'refunded' : null;
  if (nextStatus) {
    await db.prepare(
      `UPDATE generation_charges
       SET status = ?, provider_cost = COALESCE(?, provider_cost), updated_at = CURRENT_TIMESTAMP
       WHERE provider_task_id = ? AND user_id = ? AND status = 'reserved'`,
    ).bind(nextStatus, providerCost, providerTaskId, userId).run();
  }
  return readWallet(db, userId, 20);
}

export async function assertTaskOwner(db, userId, providerTaskId) {
  await ensureWallet(db, userId);
  const charge = await db.prepare(
    `SELECT id, provider_task_id, user_id, quoted_cost, reserved_cost, provider_cost, status
     FROM generation_charges WHERE provider_task_id = ? AND user_id = ?`,
  ).bind(providerTaskId, userId).first();
  if (!charge) throw new WalletError('generation_not_found', 'This generation does not belong to this wallet.', 404);
  return charge;
}

export async function topUpWallet(db, userId, amount, note = 'Admin wallet top-up') {
  await ensureWallet(db, userId);
  const credits = Math.max(1, Math.round(Number(amount) || 0));
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO wallet_topups (id, user_id, amount, note) VALUES (?, ?, ?, ?)',
  ).bind(id, userId, credits, String(note || '').slice(0, 240)).run();
  return readWallet(db, userId, 50);
}

export function walletResponse(data, setCookie = null, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  if (setCookie) headers.append('set-cookie', setCookie);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function walletErrorResponse(error, setCookie = null) {
  if (error instanceof WalletError) {
    return walletResponse(
      { error: error.code, message: error.message, ...error.details },
      setCookie,
      { status: error.status },
    );
  }
  console.error('wallet_internal_error', String(error?.message || error));
  return walletResponse(
    { error: 'wallet_internal_error', message: 'Wallet operation failed safely. No credits were changed.' },
    setCookie,
    { status: 500 },
  );
}
