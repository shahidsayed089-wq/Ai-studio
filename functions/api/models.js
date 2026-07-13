const MODELS = [
  {
    id: 'kling-cinematic',
    provider: 'kling',
    label: 'Kling Cinematic',
    operations: ['text-to-video', 'image-to-video'],
    strengths: ['camera motion', 'character performance', 'cinematic realism'],
    credential: 'KLING_ACCESS_KEY',
  },
  {
    id: 'veo-quality',
    provider: 'google',
    label: 'Veo Quality',
    operations: ['text-to-video', 'image-to-video'],
    strengths: ['native audio', 'prompt understanding', 'visual fidelity'],
    credential: 'GOOGLE_CLOUD_PROJECT',
  },
  {
    id: 'seedance-2-0',
    provider: 'seedance2.ai',
    label: 'Seedance 2.0 Live Gateway',
    operations: ['text-to-video', 'image-to-video', 'reference-to-video'],
    strengths: ['multimodal references', 'native audio', 'cinematic motion'],
    credential: 'SEEDANCE2_API_KEY',
    disclosure: 'Third-party API gateway, not the official ByteDance/Volcengine domain',
    betaLimits: { duration: 5, maxResolution: '720p' },
  },
  {
    id: 'luma-ray-3-2',
    provider: 'luma',
    label: 'Luma Ray 3.2 API',
    operations: ['text-to-video', 'image-to-video', 'video-to-video'],
    strengths: ['native 1080p', 'multi-keyframe control', 'cinematic motion'],
    credential: 'LUMA_AGENTS_API_KEY',
    latestProductModel: 'Ray3.14',
    latestProductModelApiStatus: 'pending',
  },
  {
    id: 'openai-video',
    provider: 'openai',
    label: 'OpenAI Video',
    operations: ['text-to-video', 'image-to-video'],
    strengths: ['story motion', 'prompt adherence', 'world knowledge'],
    credential: 'OPENAI_API_KEY',
  },
];

function hasCredential(env, model) {
  if (model.provider === 'seedance2.ai') {
    return Boolean(env.SEEDANCE2_API_KEY || env['.env file']);
  }
  if (model.provider === 'luma') {
    return Boolean(env.LUMA_AGENTS_API_KEY || env.LUMA_API_KEY);
  }
  return Boolean(env[model.credential]);
}

export async function onRequestGet({ env }) {
  const models = MODELS.map(({ credential, ...model }) => ({
    ...model,
    status: hasCredential(env, { ...model, credential }) ? 'live' : 'demo',
  }));

  return Response.json({ models });
}
