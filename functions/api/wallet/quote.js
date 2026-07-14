import { quoteSeedanceCredits } from '../../_lib/seedance-pricing.js';

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json', message: 'Send a valid quote request.' }, { status: 400 });
  }

  const quote = quoteSeedanceCredits({
    model: body.model,
    resolution: body.resolution,
    duration: body.duration,
    videoReferenceSeconds: body.videoReferenceSeconds,
  });

  return json({ quote });
}
