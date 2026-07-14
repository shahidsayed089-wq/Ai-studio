import {
  attachProviderTask,
  readWallet,
  refundCharge,
  reserveGeneration,
  resolveWalletUser,
  walletErrorResponse,
  walletResponse,
} from '../../_lib/wallet.js';
import { reconcileProviderCost } from '../../_lib/wallet-reconcile.js';
import { quoteSeedanceCredits } from '../../_lib/seedance-pricing.js';

const API_URL = 'https://api.seedance2.ai/v1/videos/generations';
const MODELS = new Set(['seedance-2-0', 'seedance-2-0-fast', 'seedance-2-0-mini']);
const ASPECTS = new Set(['16:9', '9:16', '4:3', '3:4', '21:9', '1:1', 'adaptive']);
const STANDARD_RESOLUTIONS = new Set(['480p', '720p', '1080p', '4k']);
const LITE_RESOLUTIONS = new Set(['480p', '720p']);
const MAX_IMAGES = 9;
const MAX_VIDEOS = 3;
const MAX_AUDIOS = 3;
const MAX_MATERIALS = 12;

function betaCode(request) {
  return request.headers.get('x-beta-code') || '';
}

function seedanceApiKey(env) {
  return typeof env.SEEDANCE2_API_KEY === 'string' ? env.SEEDANCE2_API_KEY.trim() : '';
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

function cleanUrls(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(url => typeof url === 'string' && /^https:\/\//i.test(url))
    .slice(0, limit);
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

export async function onRequestPost({ request, env }) {
  const apiKey = seedanceApiKey(env);
  if (!apiKey) {
    return walletResponse(
      { error: 'provider_not_configured', message: 'SEEDANCE2_API_KEY is not configured on this deployment yet.' },
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

  let body;
  try {
    body = await request.json();
  } catch {
    return walletResponse({ error: 'invalid_json', message: 'Send a valid JSON request body.' }, null, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 3 || prompt.length > 5000) {
    return walletResponse(
      { error: 'invalid_prompt', message: 'Prompt must be between 3 and 5000 characters.' },
      null,
      { status: 400 },
    );
  }

  const model = MODELS.has(body.model) ? body.model : 'seedance-2-0';
  const aspectRatio = ASPECTS.has(body.aspectRatio) ? body.aspectRatio : '16:9';
  const duration = normalizeDuration(body.duration);
  const resolution = normalizeResolution(model, body.resolution);
  const imageUrls = cleanUrls(body.imageUrls, MAX_IMAGES);
  const videoUrls = cleanUrls(body.videoUrls, MAX_VIDEOS);
  const audioUrls = cleanUrls(body.audioUrls, MAX_AUDIOS);
  const materialCount = imageUrls.length + videoUrls.length + audioUrls.length;

  if (materialCount > MAX_MATERIALS) {
    return walletResponse(
      { error: 'too_many_materials', message: 'Seedance accepts at most 12 reference materials in total.' },
      null,
      { status: 400 },
    );
  }
  if (audioUrls.length && !imageUrls.length && !videoUrls.length) {
    return walletResponse(
      { error: 'audio_requires_visual', message: 'Audio references require at least one image or video reference.' },
      null,
      { status: 400 },
    );
  }

  const generationType = materialCount === 0
    ? 'text-to-video'
    : videoUrls.length || audioUrls.length || imageUrls.length > 2
      ? 'reference-to-video'
      : 'image-to-video';

  const quote = quoteSeedanceCredits({
    model,
    resolution,
    duration,
    videoReferenceSeconds: body.videoReferenceSeconds || 0,
  });

  let session;
  let reservation;
  try {
    session = await resolveWalletUser(request, env);
    reservation = await reserveGeneration(env.DB, {
      userId: session.userId,
      provider: 'seedance2.ai',
      model,
      cost: quote.total,
      metadata: {
        duration,
        resolution,
        aspectRatio,
        generationType,
        materialCount,
        quote,
      },
    });
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }

  const input = {
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
  };

  if (imageUrls.length) input.image_urls = imageUrls;
  if (generationType === 'reference-to-video' && videoUrls.length) input.video_urls = videoUrls;
  if (generationType === 'reference-to-video' && audioUrls.length) input.audio_urls = audioUrls;

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, input }),
    });
  } catch (error) {
    await refundCharge(env.DB, reservation.chargeId);
    const state = await readWallet(env.DB, session.userId, 10);
    return walletResponse(
      {
        error: 'provider_unreachable',
        message: error instanceof Error ? error.message : 'Seedance provider request failed.',
        wallet: publicWallet(state),
      },
      session.setCookie,
      { status: 502 },
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.taskId) {
    await refundCharge(env.DB, reservation.chargeId);
    const state = await readWallet(env.DB, session.userId, 10);
    return walletResponse(
      {
        error: payload?.error?.code || 'provider_rejected',
        message: errorMessage(payload, 'Seedance rejected the generation request.'),
        providerStatus: response.status,
        requiredCredits: payload?.error?.required,
        availableCredits: payload?.error?.available,
        wallet: publicWallet(state),
      },
      session.setCookie,
      { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
    );
  }

  await attachProviderTask(env.DB, reservation.chargeId, payload.taskId, payload.credits ?? null);
  const reconciled = Number.isFinite(Number(payload.credits))
    ? await reconcileProviderCost(env.DB, session.userId, reservation.chargeId, Number(payload.credits))
    : await readWallet(env.DB, session.userId, 10);

  return walletResponse(
    {
      generation: {
        id: payload.taskId,
        provider: 'seedance2.ai',
        model,
        duration,
        resolution,
        mode: generationType,
        materials: {
          images: imageUrls.length,
          videos: videoUrls.length,
          audios: audioUrls.length,
          total: materialCount,
        },
        status: 'queued',
        credits: reconciled.chargedCredits ?? quote.total,
        providerCredits: reconciled.providerCredits ?? payload.credits ?? quote.total,
        quote,
      },
      wallet: publicWallet(reconciled),
    },
    session.setCookie,
    { status: 202 },
  );
}
