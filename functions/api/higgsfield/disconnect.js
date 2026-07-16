import { disconnectHiggsfield } from '../../_lib/higgsfield.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

export async function onRequestPost({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    await disconnectHiggsfield(env.DB, session.userId);
    return walletResponse({ ok: true, connected: false }, session.setCookie);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
