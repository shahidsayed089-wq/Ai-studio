import { getCreditPackage } from '../../../_lib/credit-packages.js';
import { createRazorpayOrder, ensurePaymentSchema } from '../../../_lib/razorpay.js';
import {
  ensureWallet,
  resolveWalletUser,
  walletErrorResponse,
  walletResponse,
} from '../../../_lib/wallet.js';

export async function onRequestPost({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    await ensureWallet(env.DB, session.userId);
    await ensurePaymentSchema(env.DB);

    const body = await request.json().catch(() => ({}));
    const pack = getCreditPackage(String(body.packageId || ''));
    if (!pack) {
      return walletResponse(
        { error: 'invalid_credit_package', message: 'Choose a valid AI Studio credit package.' },
        session.setCookie,
        { status: 400 },
      );
    }

    const purchaseId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO credit_purchases
       (id, user_id, package_id, credits, amount_paise, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, 'creating')`,
    ).bind(
      purchaseId,
      session.userId,
      pack.id,
      pack.credits,
      pack.pricePaise,
      pack.currency,
    ).run();

    try {
      const razorpayOrder = await createRazorpayOrder(env, {
        amount: pack.pricePaise,
        currency: pack.currency,
        receipt: `ai_${purchaseId.replace(/-/g, '').slice(0, 24)}`,
        notes: {
          purchase_id: purchaseId,
          package_id: pack.id,
          credits: String(pack.credits),
        },
      });

      await env.DB.prepare(
        `UPDATE credit_purchases
         SET razorpay_order_id = ?, status = 'created', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'creating'`,
      ).bind(razorpayOrder.id, purchaseId).run();

      return walletResponse(
        {
          checkout: {
            provider: 'razorpay',
            keyId: String(env.RAZORPAY_KEY_ID || ''),
            orderId: razorpayOrder.id,
            amount: pack.pricePaise,
            currency: pack.currency,
            package: {
              id: pack.id,
              name: pack.name,
              credits: pack.credits,
              priceRupees: pack.pricePaise / 100,
            },
          },
        },
        session.setCookie,
        { status: 201 },
      );
    } catch (error) {
      await env.DB.prepare(
        `UPDATE credit_purchases
         SET status = 'failed', failure_reason = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'creating'`,
      ).bind(String(error?.message || error).slice(0, 500), purchaseId).run();
      throw error;
    }
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
