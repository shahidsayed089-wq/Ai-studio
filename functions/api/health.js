export async function onRequestGet({ env }) {
  const checks = {
    database: Boolean(env.DB),
    storage: Boolean(env.MEDIA),
    queue: Boolean(env.GENERATION_QUEUE),
  };

  return Response.json({
    ok: true,
    service: 'ai-studio-api',
    version: '0.1.0',
    mode: checks.database && checks.storage ? 'production-ready' : 'bootstrap',
    checks,
    timestamp: new Date().toISOString(),
  });
}
