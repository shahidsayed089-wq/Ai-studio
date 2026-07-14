import {
  readWallet,
  resolveWalletUser,
  walletErrorResponse,
  walletResponse,
} from '../../_lib/wallet.js';

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    const state = await readWallet(env.DB, session.userId, 30);
    return walletResponse(
      {
        wallet: {
          userId: state.wallet.user_id,
          balance: state.wallet.balance,
          reserved: state.wallet.reserved,
          available: state.wallet.balance,
          unit: 'AI Studio credit',
          disclosure: '1 AI Studio credit = 1 upstream provider credit.',
          authenticated: session.authenticated,
          updatedAt: state.wallet.updated_at,
        },
        ledger: state.ledger,
      },
      session.setCookie,
    );
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
