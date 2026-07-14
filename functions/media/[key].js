function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}

export async function onRequestGet({ env, params }) {
  if (!env.MEDIA) return notFound();

  const key = typeof params.key === 'string' ? params.key : '';
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|mp3)$/i.test(key)) return notFound();

  const object = await env.MEDIA.get(key);
  if (!object) return notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=86400, immutable');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-disposition', 'inline');
  headers.set('accept-ranges', 'bytes');

  return new Response(object.body, { headers });
}

export async function onRequestHead(context) {
  const response = await onRequestGet(context);
  return new Response(null, { status: response.status, headers: response.headers });
}
