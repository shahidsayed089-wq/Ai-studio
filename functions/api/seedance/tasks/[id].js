const API_ROOT = 'https://api.seedance2.ai/v1/tasks';

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

function errorMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || payload?.error?.code || fallback;
}

export async function onRequestGet({ request, env, params }) {
  if (!env.SEEDANCE2_API_KEY) {
    return json({ error: 'provider_not_configured', message: 'SEEDANCE2_API_KEY is missing.' }, { status: 503 });
  }

  if (env.BETA_ACCESS_CODE && betaCode(request) !== env.BETA_ACCESS_CODE) {
    return json({ error: 'invalid_beta_code', message: 'The private beta access code is invalid.' }, { status: 401 });
  }

  const id = typeof params.id === 'string' ? params.id : '';
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    return json({ error: 'invalid_task_id', message: 'The task ID is invalid.' }, { status: 400 });
  }

  let response;
  try {
    response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${env.SEEDANCE2_API_KEY}`,
      },
    });
  } catch (error) {
    return json(
      {
        error: 'provider_unreachable',
        message: error instanceof Error ? error.message : 'Seedance status request failed.',
      },
      { status: 502 },
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json(
      {
        error: payload?.error?.code || 'provider_status_failed',
        message: errorMessage(payload, 'Could not read Seedance task status.'),
      },
      { status: response.status === 404 ? 404 : response.status >= 400 && response.status < 500 ? response.status : 502 },
    );
  }

  const rawStatus = payload.status || 'queued';
  const status = rawStatus === 'completed'
    ? 'completed'
    : rawStatus === 'failed'
      ? 'failed'
      : rawStatus === 'generating'
        ? 'processing'
        : 'queued';
  const results = Array.isArray(payload.data?.results) ? payload.data.results : [];

  return json({
    generation: {
      id: payload.id || id,
      provider: 'seedance2.ai',
      model: payload.model || 'seedance-2-0',
      status,
      providerState: rawStatus,
      billingStatus: payload.billing_status || null,
      credits: payload.credits ?? null,
      failureReason: payload.failed_reason || payload.data?.failed_reason || null,
      videoUrl: results[0] || null,
      lastFrameUrl: payload.data?.last_frame_url || null,
      videoExpiresAt: payload.data?.video_expires_at || null,
      processingTime: payload.data?.processing_time ?? null,
      createdAt: payload.created_at || null,
    },
  });
}
