function seedanceApiKey(env) {
  const preferred = typeof env.SEEDANCE2_API_KEY === 'string' ? env.SEEDANCE2_API_KEY.trim() : '';
  const dashboardLegacy = typeof env['.env file'] === 'string' ? env['.env file'].trim() : '';
  return preferred || dashboardLegacy;
}

export async function onRequestGet({ env }) {
  const checks = {
    database: Boolean(env.DB),
    storage: Boolean(env.MEDIA),
    queue: Boolean(env.GENERATION_QUEUE),
    seedance2Api: Boolean(seedanceApiKey(env)),
    lumaAgents: Boolean(env.LUMA_AGENTS_API_KEY || env.LUMA_API_KEY),
    betaGate: Boolean(env.BETA_ACCESS_CODE),
  };

  const liveModels = [
    ...(checks.seedance2Api ? ['seedance-2-0'] : []),
    ...(checks.lumaAgents ? ['ray-3.2'] : []),
  ];

  return Response.json({
    ok: true,
    service: 'ai-studio-api',
    version: '0.3.1-seedance-secret-fix',
    mode: liveModels.length ? 'private-live-beta' : 'bootstrap',
    liveModels,
    primaryLiveModel: checks.seedance2Api ? 'seedance-2-0' : checks.lumaAgents ? 'ray-3.2' : null,
    latestDreamMachineModel: 'ray3.14',
    latestDreamMachineApiStatus: 'not documented in public Agents API',
    checks,
    timestamp: new Date().toISOString(),
  });
}
