import { exchangeAuthorizationCode } from '../../../_lib/higgsfield.js';

function redirect(origin, params) {
  const url = new URL('/higgsfield-connect.html', origin);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, String(value).slice(0, 240));
  }
  return Response.redirect(url.toString(), 302);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const providerError = url.searchParams.get('error');

  if (providerError) {
    return redirect(url.origin, {
      connected: '0',
      error: url.searchParams.get('error_description') || providerError,
    });
  }
  if (!state || !code) {
    return redirect(url.origin, { connected: '0', error: 'Higgsfield did not return a valid login code.' });
  }

  try {
    await exchangeAuthorizationCode(env.DB, env, state, code);
    return redirect(url.origin, { connected: '1' });
  } catch (error) {
    console.error('higgsfield_oauth_callback_failed', String(error?.message || error));
    return redirect(url.origin, {
      connected: '0',
      error: error instanceof Error ? error.message : 'Higgsfield login failed.',
    });
  }
}
