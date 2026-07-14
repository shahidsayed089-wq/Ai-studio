import {
  assertTaskOwner,
  finalizeTask,
  readWallet,
  resolveWalletUser,
  walletErrorResponse,
  walletResponse,
} from '../../../_lib/wallet.js';

const API_ROOT = 'https://api.seedance2.ai/v1/tasks';

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

function seedanceApiKey(env) {
  return typeof env.SEEDANCE2_API_KEY === 'string' ? env.SEEDANCE2_API_KEY.trim() : '';
}

function errorMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || payload?.error?.code || fallback;
}

function publicWallet(state) {
  const wallet = state?.wallet;
  if (!wallet) return null;
  return {
    balance: wallet.balance,
    reserved: wallet.reserved,
    available: wallet.balance,
    unit: 'AI Studio credit',
    disclosure: '1 AI Studio credit = 1 upstream provider credit.',
  };
}

export async function onRequestGet({ request, env, params }) {
  const apiKey = seedanceApiKey(env);
  if (!apiKey) {
    return walletResponse(
      { error: 'provider_not_configured', message: 'SEEDANCE2_API_KEY is missing from this deployment.' },
      null,
      { status: 503 },
    );
  }

  if (env.BETA_ACCESS_CODE && betaCode(request) !== env.BETA_ACCESS_CODE) {
    return walletResponse(
      { error: 'invalid_beta_code', message: 'The private beta access code is invalid.' },
      null,
      { status: 401 },
    );
  }

  const id = typeof params.id === 'string' ? params.id : '';
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(id)) {
    return walletResponse({ error: 'invalid_task_id', message: 'The task ID is invalid.' }, null, { status: 400 });
  }

  let session;
  try {
    session = await resolveWalletUser(request, env);
    await assertTaskOwner(env.DB, session.userId, id);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }

  let response;
  try {
    response = await fetch(`${API_ROOT}/${encodeURIComponent(id)}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    const state = await readWallet(env.DB, session.userId, 20);
    return walletResponse(
      {
        error: 'provider_unreachable',
        message: error instanceof Error ? error.message : 'Seedance status request failed.',
        wallet: publicWallet(state),
      },
      session.setCookie,
      { status: 502 },
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const state = await readWallet(env.DB, session.userId, 20);
    return walletResponse(
      {
        error: payload?.error?.code || 'provider_status_failed',
        message: errorMessage(payload, 'Could not read Seedance task status.'),
        wallet: publicWallet(state),
      },
      session.setCookie,
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

  const state = status === 'completed' || status === 'failed'
    ? await finalizeTask(env.DB, session.userId, id, status, payload.credits ?? null)
    : await readWallet(env.DB, session.userId, 20);

  return walletResponse(
    {
      generation: {
        id: payload.id || id,
        provider: 'seedance2.ai',
        model: payload.model || 'seedance-2-0',
        status,
        providerState: rawStatus,
        billingStatus: status === 'failed' ? 'refunded' : status === 'completed' ? 'captured' : payload.billing_status || 'reserved',
        credits: payload.credits ?? null,
        failureReason: payload.failed_reason || payload.data?.failed_reason || null,
        videoUrl: results[0] || null,
        lastFrameUrl: payload.data?.last_frame_url || null,
        videoExpiresAt: payload.data?.video_expires_at || null,
        processingTime: payload.data?.processing_time ?? null,
        createdAt: payload.created_at || null,
      },
      wallet: publicWallet(state),
    },
    session.setCookie,
  );
}
