const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type,Authorization,Idempotency-Key,X-Beta-Code';

export async function onRequest(context) {
  const origin = context.request.headers.get('Origin');
  const allowedOrigin = context.env.PUBLIC_APP_ORIGIN || origin || '*';

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Vary', 'Origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const secured = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  const contentType = headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    return new HTMLRewriter()
      .on('body', {
        element(element) {
          element.append(
            '<script src="/assets/version-sync.js?v=20260714-seedance"></script><script src="/assets/logo-pass.js?v=20260714-seedance"></script><script src="/assets/live-beta.js?v=20260714-seedance"></script><script src="/assets/seedance-live.js?v=20260714-seedance"></script>',
            { html: true },
          );
        },
      })
      .transform(secured);
  }

  return secured;
}
