const LUMA_GENERATIONS_URL = 'https://agents.lumalabs.ai/v1/generations';

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function apiKey(env) {
  return env.LUMA_AGENTS_API_KEY || env.LUMA_API_KEY || '';
}

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

export async function onRequestGet({ request, env, params }) {
  const key = apiKey(env);
  if (!key) return json({ error: 'provider_not_configured' }, { status: 503 });

  if (env.BETA_ACCESS_CODE && betaCode(request) !== env.BETA_ACCESS_CODE) {
    return json({ error: 'invalid_beta_code' }, { status: 401 });
  }

  const id = typeof params.id === 'string' ? params.id : '';
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    return json({ error: 'invalid_generation_id' }, { status: 400 });
  }

  let providerResponse;
  try {
    providerResponse = await fetch(`${LUMA_GENERATIONS_URL}/${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${key}`,
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
        message: payload.message || payload.detail || payload.error?.message || payload.error || 'Could not read generation status.',
        requestId: providerResponse.headers.get('x-request-id'),
      },
      { status: providerResponse.status === 404 ? 404 : 502 },
    );
  }

  const providerState = payload.state || 'queued';
  const status = providerState === 'completed'
    ? 'completed'
    : providerState === 'failed'
      ? 'failed'
      : 'processing';
  const videoOutput = Array.isArray(payload.output)
    ? payload.output.find(item => item?.type === 'video' && item?.url) || payload.output.find(item => item?.url)
    : null;

  return json({
    generation: {
      id: payload.id || id,
      provider: 'luma',
      model: payload.model || 'ray-3.2',
      status,
      providerState,
      failureReason: payload.failure_reason || payload.failure_code || null,
      videoUrl: videoOutput?.url || null,
      thumbnailUrl: videoOutput?.thumbnail_url || null,
      createdAt: payload.created_at || null,
    },
  });
}
