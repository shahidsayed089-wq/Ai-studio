const SESSION_COOKIE = 'ai_studio_session';
const ONE_YEAR = 60 * 60 * 24 * 365;

const TABLES = Object.freeze({
  wallets: 'ai_wallets_v2',
  charges: 'ai_generation_charges_v2',
  transactions: 'ai_wallet_transactions_v2',
  topups: 'ai_wallet_topups_v2',
});

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ${TABLES.wallets} (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.charges} (
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
    FOREIGN KEY (user_id) REFERENCES ${TABLES.wallets}(user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.transactions} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('topup','reserve','capture','refund','adjustment')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reserved_after INTEGER NOT NULL,
    reference_id TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES ${TABLES.wallets}(user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.topups} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES ${TABLES.wallets}(user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS ai_wallet_tx_user_created_v2 ON ${TABLES.transactions}(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS ai_generation_charge_user_created_v2 ON ${TABLES.charges}(user_id, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ai_wallet_tx_reference_type_v2 ON ${TABLES.transactions}(reference_id, type) WHERE reference_id IS NOT NULL`,
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

function affectedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export async function ensureWalletSchema(db) {
  if (!db) throw new WalletError('wallet_database_missing', 'Bind a Cloudflare D1 database as DB.', 503);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (let index = 0; index < SCHEMA_STATEMENTS.length; index += 1) {
        try {
          await db.prepare(SCHEMA_STATEMENTS[index]).run();
        } catch (error) {
          console.error('wallet_v2_schema_init_failed', index + 1, String(error?.message || error));
          throw new WalletError(
            'wallet_schema_init_failed',
            `The D1 wallet schema could not initialize at step ${index + 1}.`,
            503,
            { schemaStep: index + 1, schemaVersion: 2 },
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
      'SESSION_SIGNING_KEY must be configured as a Secret with at least 24 characters.',
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
  try {
    await db.prepare(
      `INSERT OR IGNORE INTO ${TABLES.wallets} (user_id, balance, reserved) VALUES (?, 0, 0)`,
    ).bind(userId).run();
  } catch (error) {
    console.error('wallet_v2_create_failed', String(error?.message || error));
    throw new WalletError('wallet_create_failed', 'The wallet account could not be created in D1.', 503, { schemaVersion: 2 });
  }
}

export async function readWallet(db, userId, ledgerLimit = 20) {
  await ensureWallet(db, userId);
  try {
    const wallet = await db.prepare(
      `SELECT user_id, balance, reserved, created_at, updated_at FROM ${TABLES.wallets} WHERE user_id = ?`,
    ).bind(userId).first();
    const ledger = await db.prepare(
      `SELECT id, type, amount, balance_after, reserved_after, reference_id, note, created_at
       FROM ${TABLES.transactions} WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    ).bind(userId, Math.min(100, Math.max(1, ledgerLimit))).all();
    return { wallet, ledger: ledger.results || [] };
  } catch (error) {
    console.error('wallet_v2_read_failed', String(error?.message || error));
    throw new WalletError('wallet_read_failed', 'The wallet could not be read from D1.', 503, { schemaVersion: 2 });
  }
}

export async function reserveGeneration(db, { userId, provider, model, cost, metadata }) {
  await ensureWallet(db, userId);
  const amount = Math.max(1, Math.round(Number(cost) || 0));
  const chargeId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();

  let debit;
  try {
    debit = await db.prepare(
      `UPDATE ${TABLES.wallets}
       SET balance = balance - ?, reserved = reserved + ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND balance >= ?`,
    ).bind(amount, amount, userId, amount).run();
  } catch (error) {
    console.error('wallet_v2_reserve_debit_failed', String(error?.message || error));
    throw new WalletError('wallet_reserve_failed', 'The wallet could not reserve credits safely.', 503);
  }

  if (affectedRows(debit) !== 1) {
    const state = await readWallet(db, userId, 1);
    throw new WalletError(
      'insufficient_wallet_credits',
      `This render needs ${amount} credits, but the wallet has ${state.wallet?.balance ?? 0}.`,
      402,
      { requiredCredits: amount, availableCredits: state.wallet?.balance ?? 0 },
    );
  }

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO ${TABLES.charges}
         (id, user_id, provider, model, quoted_cost, reserved_cost, status, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)`,
      ).bind(chargeId, userId, provider, model, amount, amount, JSON.stringify(metadata || {})),
      db.prepare(
        `INSERT INTO ${TABLES.transactions}
         (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
         SELECT ?, user_id, 'reserve', ?, balance, reserved, ?, 'Generation credits reserved'
         FROM ${TABLES.wallets} WHERE user_id = ?`,
      ).bind(transactionId, -amount, chargeId, userId),
    ]);
  } catch (error) {
    await db.prepare(
      `UPDATE ${TABLES.wallets}
       SET balance = balance + ?, reserved = MAX(0, reserved - ?), updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    ).bind(amount, amount, userId).run().catch(() => {});
    console.error('wallet_v2_reserve_record_failed', String(error?.message || error));
    throw new WalletError('wallet_reserve_failed', 'Credit reservation was rolled back safely.', 503);
  }

  return { chargeId, cost: amount, ...(await readWallet(db, userId, 10)) };
}

export async function attachProviderTask(db, chargeId, providerTaskId, providerCost = null) {
  await db.prepare(
    `UPDATE ${TABLES.charges}
     SET provider_task_id = ?, provider_cost = COALESCE(?, provider_cost), updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'reserved'`,
  ).bind(providerTaskId, providerCost, chargeId).run();
}

export async function refundCharge(db, chargeId) {
  const charge = await db.prepare(
    `SELECT id, user_id, reserved_cost FROM ${TABLES.charges} WHERE id = ? AND status = 'reserved'`,
  ).bind(chargeId).first();
  if (!charge) return;

  const amount = Number(charge.reserved_cost || 0);
  await db.batch([
    db.prepare(
      `UPDATE ${TABLES.wallets}
       SET balance = balance + ?, reserved = MAX(0, reserved - ?), updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    ).bind(amount, amount, charge.user_id),
    db.prepare(
      `INSERT OR IGNORE INTO ${TABLES.transactions}
       (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
       SELECT ?, user_id, 'refund', ?, balance, reserved, ?, 'Failed generation refunded'
       FROM ${TABLES.wallets} WHERE user_id = ?`,
    ).bind(crypto.randomUUID(), amount, charge.id, charge.user_id),
    db.prepare(
      `UPDATE ${TABLES.charges} SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'reserved'`,
    ).bind(charge.id),
  ]);
}

export async function finalizeTask(db, userId, providerTaskId, status, providerCost = null) {
  await ensureWallet(db, userId);
  const charge = await db.prepare(
    `SELECT id, reserved_cost FROM ${TABLES.charges}
     WHERE provider_task_id = ? AND user_id = ? AND status = 'reserved'`,
  ).bind(providerTaskId, userId).first();

  if (!charge) return readWallet(db, userId, 20);

  if (status === 'completed') {
    const amount = Number(charge.reserved_cost || 0);
    await db.batch([
      db.prepare(
        `UPDATE ${TABLES.wallets}
         SET reserved = MAX(0, reserved - ?), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      ).bind(amount, userId),
      db.prepare(
        `INSERT OR IGNORE INTO ${TABLES.transactions}
         (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
         SELECT ?, user_id, 'capture', 0, balance, reserved, ?, 'Generation completed and charge captured'
         FROM ${TABLES.wallets} WHERE user_id = ?`,
      ).bind(crypto.randomUUID(), charge.id, userId),
      db.prepare(
        `UPDATE ${TABLES.charges}
         SET status = 'completed', provider_cost = COALESCE(?, provider_cost), updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'reserved'`,
      ).bind(providerCost, charge.id),
    ]);
  } else if (status === 'failed') {
    if (providerCost != null) {
      await db.prepare(`UPDATE ${TABLES.charges} SET provider_cost = ? WHERE id = ?`)
        .bind(providerCost, charge.id).run();
    }
    await refundCharge(db, charge.id);
  }

  return readWallet(db, userId, 20);
}

export async function assertTaskOwner(db, userId, providerTaskId) {
  await ensureWallet(db, userId);
  const charge = await db.prepare(
    `SELECT id, provider_task_id, user_id, quoted_cost, reserved_cost, provider_cost, status
     FROM ${TABLES.charges} WHERE provider_task_id = ? AND user_id = ?`,
  ).bind(providerTaskId, userId).first();
  if (!charge) throw new WalletError('generation_not_found', 'This generation does not belong to this wallet.', 404);
  return charge;
}

export async function topUpWalletOnce(db, userId, amount, note = 'Wallet top-up', topupId = crypto.randomUUID()) {
  await ensureWallet(db, userId);
  const credits = Math.max(1, Math.round(Number(amount) || 0));
  const safeNote = String(note || 'Wallet top-up').slice(0, 240);

  const inserted = await db.prepare(
    `INSERT OR IGNORE INTO ${TABLES.topups} (id, user_id, amount, note) VALUES (?, ?, ?, ?)`,
  ).bind(topupId, userId, credits, safeNote).run();

  if (affectedRows(inserted) !== 1) return readWallet(db, userId, 50);

  try {
    await db.batch([
      db.prepare(
        `UPDATE ${TABLES.wallets} SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      ).bind(credits, userId),
      db.prepare(
        `INSERT INTO ${TABLES.transactions}
         (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
         SELECT ?, user_id, 'topup', ?, balance, reserved, ?, ?
         FROM ${TABLES.wallets} WHERE user_id = ?`,
      ).bind(crypto.randomUUID(), credits, topupId, safeNote, userId),
    ]);
  } catch (error) {
    await db.prepare(`DELETE FROM ${TABLES.topups} WHERE id = ?`).bind(topupId).run().catch(() => {});
    console.error('wallet_v2_topup_failed', String(error?.message || error));
    throw new WalletError('wallet_topup_failed', 'The wallet top-up failed safely.', 503);
  }

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
  console.error('wallet_v2_internal_error', String(error?.message || error));
  return walletResponse(
    { error: 'wallet_internal_error', message: 'Wallet operation failed safely. No credits were changed.' },
    setCookie,
    { status: 500 },
  );
}
