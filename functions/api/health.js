function seedanceApiKey(env) {
  return typeof env.SEEDANCE2_API_KEY === 'string' ? env.SEEDANCE2_API_KEY.trim() : '';
}

export async function onRequestGet({ env }) {
  const checks = {
    database: Boolean(env.DB),
    storage: Boolean(env.MEDIA),
    queue: Boolean(env.GENERATION_QUEUE),
    seedance2Api: Boolean(seedanceApiKey(env)),
    seedanceMultimodalUpload: Boolean(env.MEDIA),
    lumaAgents: Boolean(env.LUMA_AGENTS_API_KEY || env.LUMA_API_KEY),
    betaGate: Boolean(env.BETA_ACCESS_CODE),
  };

  const liveModels = [
    ...(checks.seedance2Api ? ['seedance-2-0', 'seedance-2-0-fast', 'seedance-2-0-mini'] : []),
    ...(checks.lumaAgents ? ['ray-3.2'] : []),
  ];

  return Response.json({
    ok: true,
    service: 'ai-studio-api',
    version: '0.5.0-seedance-multimodal',
    mode: liveModels.length ? 'private-live-beta' : 'bootstrap',
    liveModels,
    primaryLiveModel: checks.seedance2Api ? 'seedance-2-0' : checks.lumaAgents ? 'ray-3.2' : null,
    seedanceCapabilities: {
      variants: ['standard', 'fast', 'mini'],
      durationSeconds: { min: 4, max: 15 },
      generationModes: ['text-to-video', 'image-to-video', 'reference-to-video'],
      references: {
        images: 9,
        videos: 3,
        videoDurationSeconds: 15,
        audios: 3,
        audioDurationSeconds: 15,
        totalMaterials: 12,
      },
      multimodalUpload: checks.seedanceMultimodalUpload,
    },
    latestDreamMachineModel: 'ray3.14',
    latestDreamMachineApiStatus: 'not documented in public Agents API',
    checks,
    timestamp: new Date().toISOString(),
  });
}
