import { createAuthorizationRedirect } from '../../../_lib/higgsfield.js';
import { resolveWalletUser, walletErrorResponse } from '../../../_lib/wallet.js';

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    const origin = new URL(request.url).origin;
    const { authorizationUrl } = await createAuthorizationRedirect(env.DB, env, session.userId, origin);
    const headers = new Headers({
      location: authorizationUrl,
      'cache-control': 'no-store',
    });
    if (session.setCookie) headers.append('set-cookie', session.setCookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
