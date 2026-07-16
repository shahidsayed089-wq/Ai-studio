import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import { isImageTool, isVideoTool, toolText } from '../../_lib/higgsfield-detect.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

const CREATOR_MODEL_PATTERN = /seedance|kling|hailuo|minimax|sora|veo|wan|gpt.?image|nano.?banana|seedream|soul|flux|cinema/i;

function modelLabel(id) {
  const value = String(id || '');
  const known = [
    [/seedance.*2.*0.*mini/i, 'Seedance 2.0 Mini'],
    [/seedance.*2.*0/i, 'Seedance 2.0'],
    [/kling.*3.*0.*turbo/i, 'Kling 3.0 Turbo'],
    [/kling.*3.*0/i, 'Kling 3.0'],
    [/hailuo|minimax/i, 'Hailuo'],
    [/gpt.*image.*2/i, 'GPT Image 2'],
    [/nano.*banana/i, 'Nano Banana'],
    [/seedream/i, 'Seedream'],
    [/soul.*2/i, 'Soul 2.0'],
    [/cinema/i, 'Cinema Studio'],
    [/veo.*3.*1/i, 'Veo 3.1'],
    [/veo/i, 'Veo'],
    [/sora/i, 'Sora'],
    [/wan/i, 'WAN'],
    [/flux/i, 'Flux'],
  ];
  const match = known.find(([pattern]) => pattern.test(value));
  if (match) return match[1];
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()).replace(/\s+/g, ' ').trim();
}

function collectModelValues(schema, output = new Set(), path = '') {
  if (!schema || typeof schema !== 'object') return output;
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => collectModelValues(item, output, `${path}.${index}`));
    return output;
  }
  for (const [key, value] of Object.entries(schema)) {
    const nextPath = path ? `${path}.${key}` : key;
    const modelField = /(^|\.)(model|model_id|modelId)(\.|$)/i.test(nextPath);
    if (modelField && ['enum', 'examples'].includes(key) && Array.isArray(value)) {
      value.filter(item => typeof item === 'string').forEach(item => output.add(item));
    } else if (modelField && ['const', 'default'].includes(key) && typeof value === 'string') {
      output.add(value);
    }
    collectModelValues(value, output, nextPath);
  }
  return output;
}

function discoverModels(generationTools, allTools) {
  const models = [];
  const seen = new Set();
  for (const tool of generationTools) {
    const kind = isImageTool(tool) ? 'image' : 'video';
    const values = [...collectModelValues(tool.inputSchema)].filter(value => CREATOR_MODEL_PATTERN.test(value));
    for (const id of values) {
      const key = `${kind}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      models.push({ id, name: modelLabel(id), kind });
    }
  }
  if (models.length) return models;

  const text = allTools.map(toolText).join(' ');
  const fallback = [
    ['seedance_2_0', 'Seedance 2.0', 'video', /seedance[_ -]?2[_ -]?0/],
    ['seedance_2_0_mini', 'Seedance 2.0 Mini', 'video', /seedance[_ -]?2[_ -]?0[_ -]?mini/],
    ['kling3_0', 'Kling 3.0', 'video', /kling[_ -]?3[_ -]?0/],
    ['kling3_0_turbo', 'Kling 3.0 Turbo', 'video', /kling[_ -]?3[_ -]?0[_ -]?turbo/],
    ['hailuo', 'Hailuo', 'video', /hailuo|minimax/],
    ['gpt_image_2', 'GPT Image 2', 'image', /gpt[_ -]?image[_ -]?2/],
    ['nano_banana', 'Nano Banana', 'image', /nano[_ -]?banana/],
    ['seedream', 'Seedream', 'image', /seedream/],
    ['soul_2_0', 'Soul 2.0', 'image', /soul[_ -]?2/],
  ];
  return fallback.filter(([, , , pattern]) => pattern.test(text)).map(([id, name, kind]) => ({ id, name, kind }));
}

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    const accessToken = await getHiggsfieldAccessToken(env.DB, env, session.userId);
    const result = await listHiggsfieldTools(accessToken);
    const generationTools = result.tools.filter(tool => isVideoTool(tool) || isImageTool(tool));
    return walletResponse({
      ok: true,
      connected: true,
      protocolVersion: result.protocolVersion,
      serverInfo: result.serverInfo,
      videoAvailable: generationTools.some(isVideoTool),
      imageAvailable: generationTools.some(isImageTool),
      models: discoverModels(generationTools, result.tools),
      tools: generationTools.map(tool => ({
        name: tool.name,
        title: tool.title || tool.name,
        kind: isImageTool(tool) ? 'image' : 'video',
        description: String(tool.description || '').slice(0, 500),
        inputSchema: tool.inputSchema || null,
      })),
    }, session.setCookie);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
