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
    id: 'luma-control',
    provider: 'luma',
    label: 'Luma Control',
    operations: ['text-to-video', 'image-to-video', 'video-to-video'],
    strengths: ['keyframes', 'modify video', 'creative control'],
    credential: 'LUMA_API_KEY',
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
    status: env[credential] ? 'live' : 'demo',
  }));

  return Response.json({ models });
}
