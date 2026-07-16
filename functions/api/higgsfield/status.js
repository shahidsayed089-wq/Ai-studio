import { getHiggsfieldConnection } from '../../_lib/higgsfield.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    const connection = await getHiggsfieldConnection(env.DB, env, session.userId);
    return walletResponse({
      connected: Boolean(connection),
      connection: connection ? {
        provider: 'Higgsfield MCP',
        expiresAt: connection.expires_at,
        scope: connection.scope,
        connectedAt: connection.created_at,
        updatedAt: connection.updated_at,
      } : null,
    }, session.setCookie);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
