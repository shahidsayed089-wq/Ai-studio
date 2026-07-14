import {
  topUpWallet,
  walletErrorResponse,
  walletResponse,
} from '../../../_lib/wallet.js';

function adminKey(request) {
  return request.headers.get('x-admin-wallet-key') || '';
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

export async function onRequestPost({ request, env }) {
  const configured = typeof env.ADMIN_WALLET_KEY === 'string' ? env.ADMIN_WALLET_KEY.trim() : '';
  const supplied = adminKey(request);
  if (configured.length < 24 || !safeEqual(configured, supplied)) {
    return walletResponse(
      { error: 'admin_unauthorized', message: 'A valid admin wallet key is required.' },
      null,
      { status: 401 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return walletResponse({ error: 'invalid_json', message: 'Send valid top-up data.' }, null, { status: 400 });
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const amount = Math.round(Number(body.amount));
  if (!/^(anon:[a-f0-9-]{36}|email:[a-f0-9]{64})$/i.test(userId)) {
    return walletResponse({ error: 'invalid_user_id', message: 'The wallet user ID is invalid.' }, null, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 10000000) {
    return walletResponse({ error: 'invalid_amount', message: 'Top-up amount must be between 1 and 10,000,000 credits.' }, null, { status: 400 });
  }

  try {
    const state = await topUpWallet(env.DB, userId, amount, body.note || 'Admin wallet top-up');
    return walletResponse({
      ok: true,
      wallet: {
        userId: state.wallet.user_id,
        balance: state.wallet.balance,
        reserved: state.wallet.reserved,
        available: state.wallet.balance,
      },
      ledger: state.ledger,
    });
  } catch (error) {
    return walletErrorResponse(error);
  }
}
