import { ensurePaymentSchema, verifyRazorpayWebhook } from '../../../_lib/razorpay.js';
import { ensureWallet, topUpWalletOnce, walletResponse } from '../../../_lib/wallet.js';

export async function onRequestPost({ request, env }) {
  const secret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return walletResponse(
      { error: 'webhook_not_configured', message: 'RAZORPAY_WEBHOOK_SECRET is missing.' },
      null,
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  if (!signature || !(await verifyRazorpayWebhook(rawBody, signature, secret))) {
    return walletResponse(
      { error: 'invalid_webhook_signature', message: 'Webhook signature validation failed.' },
      null,
      { status: 401 },
    );
  }

  const event = JSON.parse(rawBody);
  if (event?.event !== 'payment.captured') {
    return walletResponse({ ok: true, ignored: true, event: event?.event || null });
  }

  const payment = event?.payload?.payment?.entity || {};
  const orderId = String(payment.order_id || '');
  const paymentId = String(payment.id || '');
  if (!orderId || !paymentId) {
    return walletResponse(
      { error: 'invalid_webhook_payload', message: 'Captured payment is missing an order or payment ID.' },
      null,
      { status: 400 },
    );
  }

  await ensurePaymentSchema(env.DB);
  const purchase = await env.DB.prepare(
    `SELECT id, user_id, package_id, credits, amount_paise, currency, status
     FROM credit_purchases WHERE razorpay_order_id = ?`,
  ).bind(orderId).first();

  if (!purchase) {
    return walletResponse({ ok: true, ignored: true, reason: 'unknown_order' });
  }

  const paidAmount = Number(payment.amount || 0);
  const paidCurrency = String(payment.currency || '').toUpperCase();
  if (paidAmount !== Number(purchase.amount_paise) || paidCurrency !== String(purchase.currency).toUpperCase()) {
    await env.DB.prepare(
      `UPDATE credit_purchases
       SET status = 'failed', failure_reason = 'payment_amount_or_currency_mismatch', updated_at = CURRENT_TIMESTAMP
       WHERE razorpay_order_id = ? AND status != 'credited'`,
    ).bind(orderId).run();
    return walletResponse(
      { error: 'payment_mismatch', message: 'Payment amount or currency does not match the selected package.' },
      null,
      { status: 400 },
    );
  }

  await ensureWallet(env.DB, purchase.user_id);
  await env.DB.prepare(
    `UPDATE credit_purchases
     SET razorpay_payment_id = ?, status = 'credited', updated_at = CURRENT_TIMESTAMP
     WHERE razorpay_order_id = ? AND status IN ('creating','created','credited')`,
  ).bind(paymentId, orderId).run();

  await topUpWalletOnce(
    env.DB,
    purchase.user_id,
    Number(purchase.credits),
    `Razorpay purchase · ${purchase.package_id}`,
    `razorpay:${orderId}`,
  );

  return walletResponse({ ok: true, credited: Number(purchase.credits), orderId });
}
