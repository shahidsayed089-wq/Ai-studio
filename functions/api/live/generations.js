const LUMA_GENERATIONS_URL = 'https://api.lumalabs.ai/dream-machine/v1/generations';
const ALLOWED_ASPECTS = new Set(['16:9', '9:16', '1:1']);
const ALLOWED_RESOLUTIONS = new Set(['540p', '720p', '1080', '4k']);
const ALLOWED_MODELS = new Set(['ray-2', 'ray-flash-2']);

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

function normalizeResolution(value) {
  if (value === '1080p') return '1080';
  if (value === 'fast') return '720p';
  return ALLOWED_RESOLUTIONS.has(value) ? value : '720p';
}

function normalizeDuration() {
  // First live beta is deliberately capped at five seconds to control cost.
  return '5s';
}

export async function onRequestPost({ request, env }) {
  if (!env.LUMA_API_KEY) {
    return json(
      {
        error: 'provider_not_configured',
        message: 'LUMA_API_KEY is not configured on the deployment yet.',
      },
      { status: 503 },
    );
  }

  if (env.BETA_ACCESS_CODE && betaCode(request) !== env.BETA_ACCESS_CODE) {
    return json({ error: 'invalid_beta_code', message: 'The beta access code is invalid.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 3 || prompt.length > 5000) {
    return json(
      { error: 'invalid_prompt', message: 'Prompt must be between 3 and 5000 characters.' },
      { status: 400 },
    );
  }

  const model = ALLOWED_MODELS.has(body.model) ? body.model : 'ray-2';
  const aspectRatio = ALLOWED_ASPECTS.has(body.aspectRatio) ? body.aspectRatio : '16:9';
  const resolution = normalizeResolution(body.resolution);

  const providerBody = {
    prompt,
    model,
    aspect_ratio: aspectRatio,
    resolution,
    duration: normalizeDuration(body.duration),
    loop: false,
  };

  if (typeof body.imageUrl === 'string' && /^https:\/\//i.test(body.imageUrl)) {
    providerBody.keyframes = {
      frame0: {
        type: 'image',
        url: body.imageUrl,
      },
    };
  }

  let providerResponse;
  try {
    providerResponse = await fetch(LUMA_GENERATIONS_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${env.LUMA_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(providerBody),
    });
  } catch (error) {
    return json(
      { error: 'provider_unreachable', message: error instanceof Error ? error.message : 'Provider request failed.' },
      { status: 502 },
    );
  }

  const payload = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok || !payload.id) {
    return json(
      {
        error: 'provider_rejected',
        message: payload.detail || payload.message || payload.error || 'Luma rejected the generation request.',
        providerStatus: providerResponse.status,
      },
      { status: 502 },
    );
  }

  return json(
    {
      generation: {
        id: payload.id,
        provider: 'luma',
        model,
        status: payload.state === 'completed' ? 'completed' : 'processing',
        providerState: payload.state || 'dreaming',
        videoUrl: payload.assets?.video || null,
      },
    },
    { status: 202 },
  );
}
