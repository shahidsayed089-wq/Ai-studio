export async function onRequestGet({ env }) {
  const checks = {
    database: Boolean(env.DB),
    storage: Boolean(env.MEDIA),
    queue: Boolean(env.GENERATION_QUEUE),
    lumaAgents: Boolean(env.LUMA_AGENTS_API_KEY || env.LUMA_API_KEY),
    betaGate: Boolean(env.BETA_ACCESS_CODE),
  };

  return Response.json({
    ok: true,
    service: 'ai-studio-api',
    version: '0.2.0-ray32',
    mode: checks.lumaAgents ? 'private-live-beta' : 'bootstrap',
    liveModel: checks.lumaAgents ? 'ray-3.2' : null,
    latestDreamMachineModel: 'ray3.14',
    latestDreamMachineApiStatus: 'not documented in public Agents API',
    checks,
    timestamp: new Date().toISOString(),
  });
}
