const PRICING = {
  'seedance-2-0': {
    '480p': { withoutVideo: 6, withVideo: 4 },
    '720p': { withoutVideo: 12, withVideo: 8 },
    '1080p': { withoutVideo: 30, withVideo: 20 },
    '4k': { withoutVideo: 70, withVideo: 40 },
  },
  'seedance-2-0-fast': {
    '480p': { withoutVideo: 5, withVideo: 3 },
    '720p': { withoutVideo: 10, withVideo: 6 },
  },
  'seedance-2-0-mini': {
    '480p': { withoutVideo: 3, withVideo: 2 },
    '720p': { withoutVideo: 6, withVideo: 4 },
  },
};

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function quoteSeedanceCredits({ model, resolution, duration, videoReferenceSeconds = 0 }) {
  const modelPricing = PRICING[model] || PRICING['seedance-2-0'];
  const normalizedResolution = String(resolution || '').toLowerCase();
  const rate = modelPricing[normalizedResolution] || modelPricing['720p'] || Object.values(modelPricing)[0];
  const outputSeconds = Math.round(clampNumber(duration, 4, 15, 5));
  const inputSeconds = Math.round(clampNumber(videoReferenceSeconds, 0, 15, 0) * 10) / 10;
  const hasVideoReference = inputSeconds > 0;
  const billableSeconds = hasVideoReference ? outputSeconds + inputSeconds : outputSeconds;
  const creditsPerSecond = hasVideoReference ? rate.withVideo : rate.withoutVideo;
  const total = Math.ceil(creditsPerSecond * billableSeconds);

  return {
    total,
    creditsPerSecond,
    billableSeconds,
    outputSeconds,
    videoReferenceSeconds: inputSeconds,
    pricingMode: hasVideoReference ? 'combined-input-output-duration' : 'output-duration',
    unit: 'seedance2-ai-api-credit',
    disclosure: 'This quote uses Seedance2.ai API credits, not Higgsfield credits. Final billing is reconciled with the provider response.',
  };
}
