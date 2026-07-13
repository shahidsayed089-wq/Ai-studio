const API_URL = 'https://api.seedance2.ai/v1/videos/generations';
const MODELS = new Set(['seedance-2-0', 'seedance-2-0-fast', 'seedance-2-0-mini']);
const ASPECTS = new Set(['16:9', '9:16', '4:3', '3:4', '21:9', '1:1', 'adaptive']);
const STANDARD_RESOLUTIONS = new Set(['480p', '720p', '1080p', '4k']);
const LITE_RESOLUTIONS = new Set(['480p', '720p']);

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

function seedanceApiKey(env) {
  const preferred = typeof env.SEEDANCE2_API_KEY === 'string' ? env.SEEDANCE2_API_KEY.trim() : '';
  const legacy = typeof env['.env file'] === 'string' ? env['.env file'].trim() : '';
  return preferred || legacy;
}

function errorMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || payload?.error?.code || fallback;
}

function normalizeDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.min(15, Math.max(4, Math.round(number)));
}

function normalizeResolution(model, value) {
  const requested = String(value || '').toLowerCase();
  const allowed = model === 'seedance-2-0' ? STANDARD_RESOLUTIONS : LITE_RESOLUTIONS;
  return allowed.has(requested) ? requested : '720p';
}

export async function onRequestPost({ request, env }) {
  const apiKey = seedanceApiKey(env);
  if (!apiKey) {
    return json(
      {
        error: 'provider_not_configured',
        message: 'SEEDANCE2_API_KEY is not configured on this deployment yet.',
      },
      { status: 503 },
    );
  }

  if (env.BETA_ACCESS_CODE && betaCode(request) !== env.BETA_ACCESS_CODE) {
    return json({ error: 'invalid_beta_code', message: 'The private beta access code is invalid.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json', message: 'Send a valid JSON request body.' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 3 || prompt.length > 5000) {
    return json({ error: 'invalid_prompt', message: 'Prompt must be between 3 and 5000 characters.' }, { status: 400 });
  }

  const model = MODELS.has(body.model) ? body.model : 'seedance-2-0';
  const aspectRatio = ASPECTS.has(body.aspectRatio) ? body.aspectRatio : '16:9';
  const duration = normalizeDuration(body.duration);
  const resolution = normalizeResolution(model, body.resolution);
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter(url => typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 2)
    : [];

  const generationType = imageUrls.length ? 'image-to-video' : 'text-to-video';
  const providerBody = {
    model,
    input: {
      prompt,
      generation_type: generationType,
      duration,
      aspect_ratio: aspectRatio,
      resolution,
      generate_audio: body.generateAudio !== false,
      watermark: false,
      web_search: false,
      return_last_frame: true,
      seed: Number.isInteger(body.seed) ? body.seed : -1,
      ...(imageUrls.length ? { image_urls: imageUrls } : {}),
    },
  };

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(providerBody),
    });
  } catch (error) {
    return json(
      {
        error: 'provider_unreachable',
        message: error instanceof Error ? error.message : 'Seedance provider request failed.',
      },
      { status: 502 },
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.taskId) {
    return json(
      {
        error: payload?.error?.code || 'provider_rejected',
        message: errorMessage(payload, 'Seedance rejected the generation request.'),
        providerStatus: response.status,
        requiredCredits: payload?.error?.required,
        availableCredits: payload?.error?.available,
      },
      { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
    );
  }

  return json(
    {
      generation: {
        id: payload.taskId,
        provider: 'seedance2.ai',
        model,
        duration,
        resolution,
        mode: generationType,
        status: 'queued',
        credits: payload.credits ?? null,
      },
    },
    { status: 202 },
  );
}