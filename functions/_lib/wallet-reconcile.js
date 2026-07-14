import { readWallet } from './wallet.js';

export async function reconcileProviderCost(db, userId, chargeId, providerCost) {
  const actual = Math.max(1, Math.round(Number(providerCost) || 0));
  const charge = await db.prepare(
    `SELECT id, user_id, reserved_cost, status FROM generation_charges
     WHERE id = ? AND user_id = ?`,
  ).bind(chargeId, userId).first();

  if (!charge || charge.status !== 'reserved') {
    return { ...(await readWallet(db, userId, 20)), chargedCredits: null, providerCredits: actual };
  }

  const reserved = Number(charge.reserved_cost);
  const difference = actual - reserved;

  if (difference === 0) {
    await db.prepare(
      'UPDATE generation_charges SET provider_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(actual, chargeId).run();
    return { ...(await readWallet(db, userId, 20)), chargedCredits: actual, providerCredits: actual };
  }

  if (difference < 0) {
    const refund = Math.abs(difference);
    await db.batch([
      db.prepare(
        `UPDATE wallets SET balance = balance + ?, reserved = MAX(0, reserved - ?),
         updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      ).bind(refund, refund, userId),
      db.prepare(
        `UPDATE generation_charges SET reserved_cost = ?, provider_cost = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'`,
      ).bind(actual, actual, chargeId),
      db.prepare(
        `INSERT INTO wallet_transactions
         (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
         SELECT ?, ?, 'adjustment', ?, balance, reserved, ?, 'Provider quote was lower than reservation'
         FROM wallets WHERE user_id = ?`,
      ).bind(crypto.randomUUID(), userId, refund, chargeId, userId),
    ]);
    return { ...(await readWallet(db, userId, 20)), chargedCredits: actual, providerCredits: actual };
  }

  const wallet = await db.prepare('SELECT balance FROM wallets WHERE user_id = ?').bind(userId).first();
  if (Number(wallet?.balance || 0) >= difference) {
    await db.batch([
      db.prepare(
        `UPDATE wallets SET balance = balance - ?, reserved = reserved + ?,
         updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND balance >= ?`,
      ).bind(difference, difference, userId, difference),
      db.prepare(
        `UPDATE generation_charges SET reserved_cost = ?, provider_cost = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'`,
      ).bind(actual, actual, chargeId),
      db.prepare(
        `INSERT INTO wallet_transactions
         (id, user_id, type, amount, balance_after, reserved_after, reference_id, note)
         SELECT ?, ?, 'adjustment', ?, balance, reserved, ?, 'Provider quote exceeded initial reservation'
         FROM wallets WHERE user_id = ?`,
      ).bind(crypto.randomUUID(), userId, -difference, chargeId, userId),
    ]);
    return { ...(await readWallet(db, userId, 20)), chargedCredits: actual, providerCredits: actual };
  }

  await db.prepare(
    `UPDATE generation_charges SET provider_cost = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'reserved'`,
  ).bind(actual, chargeId).run();

  return {
    ...(await readWallet(db, userId, 20)),
    chargedCredits: reserved,
    providerCredits: actual,
    studioAbsorbedCredits: difference,
  };
}
