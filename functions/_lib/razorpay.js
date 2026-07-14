import { WalletError, ensureWalletSchema } from './wallet.js';

const PAYMENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS credit_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','created','credited','failed')),
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS credit_purchases_user_created
  ON credit_purchases(user_id, created_at DESC);
`;

let paymentSchemaPromise;

export async function ensurePaymentSchema(db) {
  await ensureWalletSchema(db);
  if (!paymentSchemaPromise) {
    paymentSchemaPromise = db.exec(PAYMENT_SCHEMA).catch(error => {
      paymentSchemaPromise = undefined;
      throw error;
    });
  }
  await paymentSchemaPromise;
}

function bytesToHex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export async function hmacSha256Hex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyRazorpayWebhook(rawBody, signature, secret) {
  const expected = await hmacSha256Hex(rawBody, secret);
  return safeEqual(expected, signature);
}

export async function createRazorpayOrder(env, order) {
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    throw new WalletError('checkout_not_configured', 'Razorpay checkout is not configured yet.', 503);
  }

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(order),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const message = payload?.error?.description || payload?.error?.reason || 'Razorpay could not create the order.';
    throw new WalletError('checkout_order_failed', message, 502);
  }
  return payload;
}
