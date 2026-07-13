const LUMA_GENERATIONS_URL = 'https://api.lumalabs.ai/dream-machine/v1/generations';

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

export async function onRequestGet({ request, env, params }) {
  if (!env.LUMA_API_KEY) {
    return json({ error: 'provider_not_configured' }, { status: 503 });
  }

  if (env.BETA_ACCESS_CODE && betaCode(request) !== env.BETA_ACCESS_CODE) {
    return json({ error: 'invalid_beta_code' }, { status: 401 });
  }

  const id = typeof params.id === 'string' ? params.id : '';
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
    return json({ error: 'invalid_generation_id' }, { status: 400 });
  }

  let providerResponse;
  try {
    providerResponse = await fetch(`${LUMA_GENERATIONS_URL}/${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${env.LUMA_API_KEY}`,
      },
    });
  } catch (error) {
    return json(
      { error: 'provider_unreachable', message: error instanceof Error ? error.message : 'Status request failed.' },
      { status: 502 },
    );
  }

  const payload = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    return json(
      {
        error: 'provider_status_failed',
        message: payload.detail || payload.message || payload.error || 'Could not read generation status.',
      },
      { status: providerResponse.status === 404 ? 404 : 502 },
    );
  }

  const providerState = payload.state || 'dreaming';
  const status = providerState === 'completed'
    ? 'completed'
    : providerState === 'failed'
      ? 'failed'
      : 'processing';

  return json({
    generation: {
      id: payload.id || id,
      provider: 'luma',
      model: payload.version || payload.request?.model || 'ray-2',
      status,
      providerState,
      failureReason: payload.failure_reason || null,
      videoUrl: payload.assets?.video || null,
      thumbnailUrl: payload.assets?.image || null,
      createdAt: payload.created_at || null,
    },
  });
}
