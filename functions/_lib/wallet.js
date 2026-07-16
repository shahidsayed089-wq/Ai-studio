const SESSION_COOKIE = 'ai_studio_session';
const ONE_YEAR = 60 * 60 * 24 * 365;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS generation_charges (
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
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
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
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_topups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES wallets(user_id)
  )`,
  'CREATE INDEX IF NOT EXISTS wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS generation_charges_user_created ON generation_charges(user_id, created_at DESC)',
  'CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_reference_type ON wallet_transactions(reference_id, type) WHERE reference_id IS NOT NULL',
];

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
    schemaPromise = (async () => {
      for (let index = 0; index < SCHEMA_STATEMENTS.length; index += 1) {
        try {
          await db.prepare(SCHEMA_STATEMENTS[index]).run();
        } catch (error) {
          console.error('wallet_schema_init_failed', index + 1, String(error?.message || error));
          throw new WalletError(
            'wallet_schema_init_failed',
            `The D1 wallet schema could not initialize at step ${index + 1}.`,
            503,
            { schemaStep: index + 1 },
          );
        }
      }
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
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
  const transactionId = crypto.randomUUID();

  await db.batch([
    db.prepare(
      `INSERT INTO generation_charges
       (id, user_id, provider, model, quoted_cost, reserved_cost, status, metadata_json)
       SELECT ?, ?, ?, ?, ?, ?, 'reserved', ?
       WHERE EXISTS (SELECT 1 FROM wallets WHERE user_id = ? AND balance >= ?)`,
    ).bind(chargeId, userId, provider, model, amount, amount, JSON.stringify(metadata || {}), userId, amount),
    db.prepare(
      `UPDATE wallets SET balance = balance - ?, reserved = reserved + ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND EXISTS (
         SELECT 1 FROM generation_charges WHERE id = ? AND user_id = ? AND status = 'reserved'
       )`,
    ).bind(amount, amount, userId, chargeId, userId),
    db.prepare(
      `INSERT OR IGNORE INTO wallet_transactions
       (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
       SELECT ?, user_id, 'reserve', ?, balance, reserved, ?, 'Generation credits reserved'
       FROM wallets WHERE user_id = ? AND EXISTS (
         SELECT 1 FROM generation_charges WHERE id = ? AND user_id = ? AND status = 'reserved'
       )`,
    ).bind(transactionId, -amount, chargeId, userId, chargeId, userId),
  ]);

  const charge = await db.prepare(
    'SELECT id FROM generation_charges WHERE id = ? AND user_id = ?',
  ).bind(chargeId, userId).first();

  if (!charge) {
    const state = await readWallet(db, userId, 1);
    throw new WalletError(
      'insufficient_wallet_credits',
      `This render needs ${amount} credits, but the wallet has ${state.wallet?.balance ?? 0}.`,
      402,
      { requiredCredits: amount, availableCredits: state.wallet?.balance ?? 0 },
    );
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
  const transactionId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `UPDATE wallets
       SET balance = balance + COALESCE((SELECT reserved_cost FROM generation_charges WHERE id = ? AND status = 'reserved'), 0),
           reserved = MAX(0, reserved - COALESCE((SELECT reserved_cost FROM generation_charges WHERE id = ? AND status = 'reserved'), 0)),
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = (SELECT user_id FROM generation_charges WHERE id = ? AND status = 'reserved')`,
    ).bind(chargeId, chargeId, chargeId),
    db.prepare(
      `INSERT OR IGNORE INTO wallet_transactions
       (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
       SELECT ?, c.user_id, 'refund', c.reserved_cost, w.balance, w.reserved, c.id, 'Failed generation refunded'
       FROM generation_charges c JOIN wallets w ON w.user_id = c.user_id
       WHERE c.id = ? AND c.status = 'reserved'`,
    ).bind(transactionId, chargeId),
    db.prepare(
      `UPDATE generation_charges SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'reserved'`,
    ).bind(chargeId),
  ]);
}

export async function finalizeTask(db, userId, providerTaskId, status, providerCost = null) {
  await ensureWallet(db, userId);

  if (status === 'completed') {
    const transactionId = crypto.randomUUID();
    await db.batch([
      db.prepare(
        `UPDATE wallets
         SET reserved = MAX(0, reserved - COALESCE((
           SELECT reserved_cost FROM generation_charges
           WHERE provider_task_id = ? AND user_id = ? AND status = 'reserved'
         ), 0)), updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
      ).bind(providerTaskId, userId, userId),
      db.prepare(
        `INSERT OR IGNORE INTO wallet_transactions
         (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
         SELECT ?, c.user_id, 'capture', 0, w.balance, w.reserved, c.id, 'Generation completed and charge captured'
         FROM generation_charges c JOIN wallets w ON w.user_id = c.user_id
         WHERE c.provider_task_id = ? AND c.user_id = ? AND c.status = 'reserved'`,
      ).bind(transactionId, providerTaskId, userId),
      db.prepare(
        `UPDATE generation_charges
         SET status = 'completed', provider_cost = COALESCE(?, provider_cost), updated_at = CURRENT_TIMESTAMP
         WHERE provider_task_id = ? AND user_id = ? AND status = 'reserved'`,
      ).bind(providerCost, providerTaskId, userId),
    ]);
  } else if (status === 'failed') {
    const charge = await db.prepare(
      `SELECT id FROM generation_charges
       WHERE provider_task_id = ? AND user_id = ? AND status = 'reserved'`,
    ).bind(providerTaskId, userId).first();
    if (charge?.id) {
      if (providerCost != null) {
        await db.prepare(
          'UPDATE generation_charges SET provider_cost = ? WHERE id = ?',
        ).bind(providerCost, charge.id).run();
      }
      await refundCharge(db, charge.id);
    }
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

export async function topUpWalletOnce(db, userId, amount, note = 'Wallet top-up', topupId = crypto.randomUUID()) {
  await ensureWallet(db, userId);
  const credits = Math.max(1, Math.round(Number(amount) || 0));
  const transactionId = crypto.randomUUID();

  await db.batch([
    db.prepare(
      'INSERT OR IGNORE INTO wallet_topups (id, user_id, amount, note) VALUES (?, ?, ?, ?)',
    ).bind(topupId, userId, credits, String(note || '').slice(0, 240)),
    db.prepare(
      `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?
         AND EXISTS (SELECT 1 FROM wallet_topups WHERE id = ? AND user_id = ?)
         AND NOT EXISTS (SELECT 1 FROM wallet_transactions WHERE reference_id = ? AND type = 'topup')`,
    ).bind(credits, userId, topupId, userId, topupId),
    db.prepare(
      `INSERT OR IGNORE INTO wallet_transactions
       (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
       SELECT ?, user_id, 'topup', ?, balance, reserved, ?, ?
       FROM wallets WHERE user_id = ?
         AND EXISTS (SELECT 1 FROM wallet_topups WHERE id = ? AND user_id = ?)
         AND NOT EXISTS (SELECT 1 FROM wallet_transactions WHERE reference_id = ? AND type = 'topup')`,
    ).bind(transactionId, credits, topupId, String(note || 'Wallet top-up').slice(0, 240), userId, topupId, userId, topupId),
  ]);

  return readWallet(db, userId, 50);
}

export async function topUpWallet(db, userId, amount, note = 'Admin wallet top-up') {
  return topUpWalletOnce(db, userId, amount, note, crypto.randomUUID());
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
