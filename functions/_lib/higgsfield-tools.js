const MCP_URL = 'https://mcp.higgsfield.ai/mcp';
const PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'];

function parseMcpPayload(text, expectedId = null) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { /* Try SSE below. */ }
  const events = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try { events.push(JSON.parse(data)); } catch { /* Ignore keepalive lines. */ }
  }
  if (expectedId != null) return events.find(item => item?.id === expectedId) || events.at(-1) || null;
  return events.at(-1) || null;
}

async function mcpPost(accessToken, payload, sessionId = null) {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const parsed = parseMcpPayload(text, payload.id ?? null);
  if (!response.ok || parsed?.error) {
    const message = parsed?.error?.message || text.slice(0, 400) || `MCP request failed (${response.status})`;
    const error = new Error(String(message));
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }
  return { payload: parsed, sessionId: response.headers.get('mcp-session-id') || sessionId };
}

async function initialize(accessToken) {
  let initialized;
  let lastError;
  for (const protocolVersion of PROTOCOL_VERSIONS) {
    try {
      initialized = await mcpPost(accessToken, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'Shazan AI Studio', version: '1.0.0' },
        },
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!initialized) throw lastError || new Error('Higgsfield MCP initialization failed.');
  await mcpPost(accessToken, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }, initialized.sessionId).catch(() => {});
  return initialized;
}

export async function callHiggsfieldTool(accessToken, toolName, args = {}) {
  const initialized = await initialize(accessToken);
  const called = await mcpPost(accessToken, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  }, initialized.sessionId);
  return called.payload?.result || null;
}

export function toolText(tool) {
  let schema = '';
  try { schema = JSON.stringify(tool?.inputSchema || {}); } catch { schema = ''; }
  return `${tool?.name || ''} ${tool?.title || ''} ${tool?.description || ''} ${schema}`.toLowerCase();
}

export function isVideoTool(tool) {
  const text = toolText(tool);
  return /generate[_ -]?video|video[_ -]?generation|text[_ -]?to[_ -]?video|image[_ -]?to[_ -]?video/.test(text)
    && !/status|recover|result|history|list|cancel/.test(text);
}

export function isImageTool(tool) {
  const text = toolText(tool);
  return /generate[_ -]?image|image[_ -]?generation|text[_ -]?to[_ -]?image/.test(text)
    && !/status|recover|result|history|list|cancel/.test(text);
}

export function selectGenerationTool(tools, kind, requestedName = '') {
  const wanted = String(requestedName || '').trim();
  if (wanted) {
    const exact = tools.find(tool => tool.name === wanted && (kind === 'image' ? isImageTool(tool) : isVideoTool(tool)));
    if (exact) return exact;
  }
  const test = kind === 'image' ? isImageTool : isVideoTool;
  const candidates = tools.filter(test);
  const score = tool => {
    const text = toolText(tool);
    let value = 0;
    if (kind === 'video' && /^generate[_-]?video$/i.test(tool.name || '')) value += 100;
    if (kind === 'image' && /^generate[_-]?image$/i.test(tool.name || '')) value += 100;
    if (/^generate/.test(String(tool.name || '').toLowerCase())) value += 30;
    if (/marketing|clipper|youtube|avatar|product/.test(text)) value -= 20;
    return value;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0] || null;
}

function propertiesOf(tool) {
  const schema = tool?.inputSchema;
  return schema && typeof schema === 'object' && schema.properties && typeof schema.properties === 'object'
    ? schema.properties
    : {};
}

function setFirst(target, properties, aliases, value) {
  if (value == null || value === '') return false;
  const key = aliases.find(alias => Object.prototype.hasOwnProperty.call(properties, alias));
  if (!key) return false;
  target[key] = value;
  return true;
}

function normalizedModel(model) {
  const aliases = {
    'seedance-2.0': 'seedance_2_0',
    'seedance-2.0-mini': 'seedance_2_0_mini',
    'kling-3.0': 'kling3_0',
    'kling-3.0-turbo': 'kling3_0_turbo',
    'hailuo': 'hailuo',
    'gpt-image-2': 'gpt_image_2',
    'nano-banana': 'nano_banana',
    'seedream': 'seedream',
    'soul-2.0': 'soul_2_0',
  };
  return aliases[model] || model;
}

export function buildGenerationArguments(tool, input) {
  const properties = propertiesOf(tool);
  const args = {};
  const model = normalizedModel(input.model);
  const promptSet = setFirst(args, properties, ['prompt', 'text', 'description', 'instruction'], input.prompt);
  const modelSet = setFirst(args, properties, ['model', 'model_id', 'modelId'], model);
  setFirst(args, properties, ['negative_prompt', 'negativePrompt'], input.negativePrompt);
  setFirst(args, properties, ['aspect_ratio', 'aspectRatio', 'ratio'], input.aspectRatio);
  setFirst(args, properties, ['duration', 'duration_seconds', 'seconds'], input.duration);
  setFirst(args, properties, ['resolution', 'quality', 'size'], input.resolution);
  setFirst(args, properties, ['seed'], input.seed);
  setFirst(args, properties, ['generate_audio', 'audio', 'sound'], Boolean(input.generateAudio));

  const mediaIds = Array.isArray(input.mediaIds) ? input.mediaIds.filter(Boolean) : [];
  if (mediaIds.length) {
    if (!setFirst(args, properties, ['media_ids', 'mediaIds', 'medias', 'references'], mediaIds)) {
      setFirst(args, properties, ['media_id', 'mediaId', 'reference_media_id'], mediaIds[0]);
    }
  }

  const paramsKey = ['params', 'parameters', 'settings', 'options'].find(key => Object.prototype.hasOwnProperty.call(properties, key));
  if (paramsKey) {
    args[paramsKey] = {
      aspect_ratio: input.aspectRatio,
      duration: input.duration,
      resolution: input.resolution,
      generate_audio: Boolean(input.generateAudio),
    };
  }

  if (!Object.keys(properties).length) {
    return {
      prompt: input.prompt,
      model,
      aspect_ratio: input.aspectRatio,
      duration: input.duration,
      resolution: input.resolution,
      generate_audio: Boolean(input.generateAudio),
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...(Number.isInteger(input.seed) ? { seed: input.seed } : {}),
      ...(mediaIds.length ? { medias: mediaIds } : {}),
    };
  }

  if (!promptSet) args.prompt = input.prompt;
  if (!modelSet && model) args.model = model;
  return args;
}

export function findMediaImportTool(tools) {
  return tools.find(tool => /media[_ -]?import[_ -]?url|import[_ -]?.*media.*url/.test(toolText(tool))) || null;
}

export function buildMediaImportArguments(tool, url) {
  const properties = propertiesOf(tool);
  const args = {};
  if (!setFirst(args, properties, ['url', 'media_url', 'source_url', 'remote_url'], url)) args.url = url;
  return args;
}

function collect(value, path = '', output = { strings: [], ids: [], objects: [] }) {
  if (typeof value === 'string') {
    output.strings.push(value);
    const key = path.split('.').at(-1) || '';
    if (/id|task|job|generation|media/i.test(key) && value.length < 240) output.ids.push(value);
    try {
      const parsed = JSON.parse(value);
      collect(parsed, `${path}.parsed`, output);
    } catch { /* Plain text. */ }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}.${index}`, output));
  } else if (value && typeof value === 'object') {
    output.objects.push(value);
    Object.entries(value).forEach(([key, item]) => collect(item, path ? `${path}.${key}` : key, output));
  }
  return output;
}

export function extractToolResult(result) {
  const collected = collect(result);
  const urls = [];
  const urlPattern = /https?:\/\/[^\s"'<>]+/g;
  for (const value of collected.strings) {
    for (const match of value.match(urlPattern) || []) {
      const clean = match.replace(/[),.;]+$/, '');
      if (!urls.includes(clean)) urls.push(clean);
    }
  }
  const mediaUrl = urls.find(url => /\.(mp4|webm|mov|m4v|png|jpe?g|webp|gif)(\?|$)/i.test(url)) || urls[0] || null;
  const providerJobId = collected.ids.find(value => /^[a-z0-9][a-z0-9._:-]{5,}$/i.test(value)) || null;
  const text = collected.strings.find(value => value.length > 8 && !/^https?:\/\//i.test(value)) || '';
  const lower = `${text} ${JSON.stringify(result || {})}`.toLowerCase();
  const failed = Boolean(result?.isError) || /\b(failed|error|rejected|cancelled)\b/.test(lower);
  const completed = Boolean(mediaUrl) || /\b(completed|succeeded|ready|finished)\b/.test(lower);
  return {
    mediaUrl,
    urls,
    providerJobId,
    text: text.slice(0, 1200),
    status: failed ? 'failed' : completed ? 'completed' : 'submitted',
  };
}

export function findStatusTool(tools) {
  const candidates = tools.filter(tool => {
    const text = toolText(tool);
    return /status|recover|result|progress/.test(text)
      && /generation|video|image|media|job|task/.test(text)
      && !/generate[_ -]?(video|image)/.test(text);
  });
  return candidates[0] || null;
}

export function buildStatusArguments(tool, providerJobId) {
  const properties = propertiesOf(tool);
  const args = {};
  if (!setFirst(args, properties, ['id', 'task_id', 'taskId', 'job_id', 'jobId', 'generation_id', 'generationId', 'media_job_id'], providerJobId)) {
    args.id = providerJobId;
  }
  return args;
}
