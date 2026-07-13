function json(data, init = {}) {
  return Response.json(data, init);
}

function requireInternalToken(request, env) {
  if (!env.INTERNAL_API_TOKEN) return false;
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${env.INTERNAL_API_TOKEN}`;
}

export async function onRequestPost({ request, env }) {
  if (!requireInternalToken(request, env)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!env.DB || !env.GENERATION_QUEUE) {
    return json(
      {
        error: 'backend_not_configured',
        message: 'Bind D1 as DB and a Queue as GENERATION_QUEUE before enabling live generations.',
      },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const operation = typeof body.operation === 'string' ? body.operation : 'text-to-video';
  const idempotencyKey = request.headers.get('Idempotency-Key') || body.idempotencyKey;

  if (!prompt || !model || !workspaceId || !userId || !idempotencyKey) {
    return json(
      { error: 'missing_fields', required: ['prompt', 'model', 'workspaceId', 'userId', 'Idempotency-Key'] },
      { status: 400 },
    );
  }

  if (prompt.length > 12000) {
    return json({ error: 'prompt_too_long' }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    'SELECT id, status, created_at FROM generations WHERE idempotency_key = ?1',
  )
    .bind(idempotencyKey)
    .first();

  if (existing) {
    return json({ generation: existing, idempotent: true }, { status: 200 });
  }

  const generationId = crypto.randomUUID();
  const provider = model.split('-')[0] || 'unknown';
  const reservedCredits = Number.isInteger(body.estimatedCredits) ? Math.max(0, body.estimatedCredits) : 0;
  const requestJson = JSON.stringify({
    aspectRatio: body.aspectRatio || '16:9',
    duration: body.duration || 5,
    resolution: body.resolution || '720p',
    audio: body.audio || 'auto',
    references: Array.isArray(body.references) ? body.references : [],
  });

  await env.DB.prepare(
    `INSERT INTO generations (
      id, workspace_id, project_id, shot_id, user_id, provider, model, operation,
      status, prompt, request_json, reserved_credits, idempotency_key
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'queued', ?9, ?10, ?11, ?12)`,
  )
    .bind(
      generationId,
      workspaceId,
      body.projectId || null,
      body.shotId || null,
      userId,
      provider,
      model,
      operation,
      prompt,
      requestJson,
      reservedCredits,
      idempotencyKey,
    )
    .run();

  await env.GENERATION_QUEUE.send({ generationId });

  return json(
    {
      generation: {
        id: generationId,
        status: 'queued',
        model,
        operation,
        reservedCredits,
      },
    },
    { status: 202 },
  );
}
