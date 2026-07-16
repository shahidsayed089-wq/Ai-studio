import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import { isImageTool, isVideoTool, toolText } from '../../_lib/higgsfield-detect.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

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
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function collectModelValues(schema, output = new Set(), path = '') {
  if (!schema || typeof schema !== 'object') return output;
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => collectModelValues(item, output, `${path}.${index}`));
    return output;
  }

  for (const [key, value] of Object.entries(schema)) {
    const nextPath = path ? `${path}.${key}` : key;
    const insideModelField = /(^|\.)(model|model_id|modelId)(\.|$)/i.test(nextPath);

    if (insideModelField && ['enum', 'examples'].includes(key) && Array.isArray(value)) {
      value
        .filter(item => typeof item === 'string' && item.trim())
        .forEach(item => output.add(item.trim()));
    } else if (insideModelField && ['const', 'default'].includes(key) && typeof value === 'string' && value.trim()) {
      output.add(value.trim());
    }

    collectModelValues(value, output, nextPath);
  }

  return output;
}

function discoverModels(generationTools) {
  const models = [];
  const seen = new Set();

  for (const tool of generationTools) {
    const kind = isImageTool(tool) ? 'image' : 'video';
    const values = [...collectModelValues(tool.inputSchema)];

    if (!values.length) {
      const key = `${kind}:tool:${tool.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        models.push({
          id: tool.name,
          name: tool.title || modelLabel(tool.name),
          kind,
          toolName: tool.name,
          source: 'tool-auto',
          autoModel: true,
        });
      }
      continue;
    }

    for (const id of values) {
      const key = `${kind}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      models.push({
        id,
        name: modelLabel(id),
        kind,
        toolName: tool.name,
        source: 'schema',
        autoModel: false,
      });
    }
  }

  return models.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.name.localeCompare(b.name);
  });
}

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    const accessToken = await getHiggsfieldAccessToken(env.DB, env, session.userId);
    const result = await listHiggsfieldTools(accessToken);
    const generationTools = result.tools.filter(tool => isVideoTool(tool) || isImageTool(tool));
    const models = discoverModels(generationTools);

    return walletResponse({
      ok: true,
      connected: true,
      protocolVersion: result.protocolVersion,
      serverInfo: result.serverInfo,
      totalMcpTools: result.tools.length,
      generationToolCount: generationTools.length,
      videoAvailable: generationTools.some(isVideoTool),
      imageAvailable: generationTools.some(isImageTool),
      models,
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
