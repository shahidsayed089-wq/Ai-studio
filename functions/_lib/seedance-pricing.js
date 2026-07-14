const PRICING = {
  'seedance-2-0': {
    '480p': { output: 6, videoInput: 4 },
    '720p': { output: 12, videoInput: 8 },
    '1080p': { output: 30, videoInput: 20 },
    '4k': { output: 70, videoInput: 40 },
  },
  'seedance-2-0-fast': {
    '480p': { output: 5, videoInput: 3 },
    '720p': { output: 10, videoInput: 6 },
  },
  'seedance-2-0-mini': {
    '480p': { output: 3, videoInput: 2 },
    '720p': { output: 6, videoInput: 4 },
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
  const outputCredits = Math.ceil(rate.output * outputSeconds);
  const videoInputCredits = Math.ceil(rate.videoInput * inputSeconds);
  return {
    total: outputCredits + videoInputCredits,
    outputCredits,
    videoInputCredits,
    outputSeconds,
    videoReferenceSeconds: inputSeconds,
    unit: 'provider-credit',
    disclosure: '1 AI Studio credit equals 1 upstream provider credit.',
  };
}
