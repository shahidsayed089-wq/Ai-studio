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
    walletSessionSigning: typeof env.SESSION_SIGNING_KEY === 'string' && env.SESSION_SIGNING_KEY.trim().length >= 24,
    walletAdminKey: typeof env.ADMIN_WALLET_KEY === 'string' && env.ADMIN_WALLET_KEY.trim().length >= 24,
  };

  checks.walletReady = checks.database && checks.walletSessionSigning;

  const liveModels = [
    ...(checks.seedance2Api ? ['seedance-2-0', 'seedance-2-0-fast', 'seedance-2-0-mini'] : []),
    ...(checks.lumaAgents ? ['ray-3.2'] : []),
  ];

  return Response.json({
    ok: true,
    service: 'ai-studio-api',
    version: '0.6.0-real-wallet',
    mode: liveModels.length && checks.walletReady ? 'wallet-protected-live-beta' : 'setup-required',
    liveModels,
    primaryLiveModel: checks.seedance2Api ? 'seedance-2-0' : checks.lumaAgents ? 'ray-3.2' : null,
    wallet: {
      ready: checks.walletReady,
      unit: 'AI Studio credit',
      conversion: '1 AI Studio credit = 1 upstream provider credit',
      reserveBeforeSubmit: true,
      captureOnSuccess: true,
      automaticRefundOnFailure: true,
      ledger: true,
    },
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
