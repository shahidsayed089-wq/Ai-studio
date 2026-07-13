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
    id: 'seedance-multimodal',
    provider: 'byteplus',
    label: 'Seedance Multimodal',
    operations: ['text-to-video', 'image-to-video', 'reference-to-video'],
    strengths: ['multiple references', 'complex action', 'continuity'],
    credential: 'BYTEPLUS_API_KEY',
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

export async function onRequestGet({ env }) {
  const models = MODELS.map(({ credential, ...model }) => ({
    ...model,
    status: env[credential] || (model.provider === 'luma' && env.LUMA_API_KEY) ? 'live' : 'demo',
  }));

  return Response.json({ models });
}
