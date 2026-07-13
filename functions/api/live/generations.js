const LUMA_GENERATIONS_URL = 'https://agents.lumalabs.ai/v1/generations';
const ALLOWED_ASPECTS = new Set(['16:9', '9:16', '1:1']);
const ALLOWED_RESOLUTIONS = new Set(['540p', '720p', '1080p']);

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

function normalizeResolution(value) {
  if (value === '4K' || value === '4k' || value === '1080') return '1080p';
  if (value === 'Fast' || value === 'fast') return '720p';
  return ALLOWED_RESOLUTIONS.has(value) ? value : '720p';
}

export async function onRequestPost({ request, env }) {
  const key = apiKey(env);
  if (!key) {
    return json(
      {
        error: 'provider_not_configured',
        message: 'LUMA_AGENTS_API_KEY is not configured on the deployment yet.',
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

  const aspectRatio = ALLOWED_ASPECTS.has(body.aspectRatio) ? body.aspectRatio : '16:9';
  const resolution = normalizeResolution(body.resolution);
  const providerBody = {
    model: 'ray-3.2',
    type: 'video',
    prompt,
    aspect_ratio: aspectRatio,
    user_id: 'shazan-ai-studio-private-beta',
    video: {
      resolution,
      duration: '5s',
    },
  };

  if (typeof body.imageUrl === 'string' && /^https:\/\//i.test(body.imageUrl)) {
    providerBody.video.start_frame = { url: body.imageUrl };
  }

  let providerResponse;
  try {
    providerResponse = await fetch(LUMA_GENERATIONS_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${key}`,
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
        message: payload.message || payload.detail || payload.error?.message || payload.error || 'Luma rejected the generation request.',
        providerStatus: providerResponse.status,
        requestId: providerResponse.headers.get('x-request-id'),
      },
      { status: 502 },
    );
  }

  const outputUrl = Array.isArray(payload.output) ? payload.output.find(item => item?.url)?.url || null : null;
  return json(
    {
      generation: {
        id: payload.id,
        provider: 'luma',
        model: 'ray-3.2',
        status: payload.state === 'completed' ? 'completed' : 'processing',
        providerState: payload.state || 'queued',
        videoUrl: outputUrl,
      },
    },
    { status: 202 },
  );
}
