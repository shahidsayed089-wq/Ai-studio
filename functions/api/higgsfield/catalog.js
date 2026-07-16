import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import { isImageTool, isVideoTool, toolText } from '../../_lib/higgsfield-detect.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

function titleCase(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function modelLabel(id) {
  const value = String(id || '').trim();
  const known = [
    [/seedance.*2.*0.*mini/i, 'Seedance 2.0 Mini'],
    [/seedance.*2.*0/i, 'Seedance 2.0'],
    [/kling.*3.*0.*turbo/i, 'Kling 3.0 Turbo'],
    [/kling.*3.*0/i, 'Kling 3.0'],
    [/nano.*banana.*pro/i, 'Nano Banana Pro'],
    [/nano.*banana/i, 'Nano Banana'],
    [/gpt.*image.*2/i, 'GPT Image 2'],
    [/seedream/i, 'Seedream'],
    [/soul.*2/i, 'Soul 2.0'],
    [/hailuo|minimax/i, 'Hailuo'],
  ];
  return known.find(([pattern]) => pattern.test(value))?.[1] || titleCase(value);
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
      value.filter(item => typeof item === 'string' && item.trim()).forEach(item => output.add(item.trim()));
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
    if (!values.length) values.push(kind === 'image' ? 'auto_image' : 'auto_video');
    for (const id of values) {
      const clean = String(id).trim();
      const key = `${kind}:${clean.toLowerCase()}`;
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      models.push({
        id: clean,
        name: clean.startsWith('auto_') ? `${kind === 'image' ? 'Image' : 'Video'} Auto` : modelLabel(clean),
        kind,
        toolName: tool.name,
        source: clean.startsWith('auto_') ? 'tool-auto' : 'schema',
        autoModel: clean.startsWith('auto_'),
      });
    }
  }
  return models.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind));
}

function categoryFor(tool) {
  const text = toolText(tool);
  if (isVideoTool(tool) || isImageTool(tool)) return 'Generation';
  if (/marketing|campaign|product|ad\b|commerce|shop|brand|ugc/.test(text)) return 'Marketing';
  if (/3d|glb|mesh|texture|render/.test(text)) return '3D';
  if (/audio|voice|music|sound|lip.?sync/.test(text)) return 'Audio';
  if (/website|webpage|landing|app\b|code|html/.test(text)) return 'Web & Apps';
  if (/analysis|analy[sz]e|inspect|understand|describe|recommend|explore/.test(text)) return 'Analysis';
  if (/media|upload|import|download|library|asset/.test(text)) return 'Media';
  if (/story|script|cinema|character|avatar|creative|image|video|shorts/.test(text)) return 'Creative';
  return 'Utility';
}

function appList(tools) {
  return tools.map(tool => ({
    name: tool.name,
    title: tool.title || titleCase(tool.name),
    description: String(tool.description || 'Connected Higgsfield MCP capability.').replace(/\s+/g, ' ').slice(0, 500),
    category: categoryFor(tool),
    generation: isVideoTool(tool) || isImageTool(tool),
  })).sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
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
      apps: appList(result.tools),
      tools: generationTools.map(tool => ({
        name: tool.name,
        title: tool.title || tool.name,
        kind: isImageTool(tool) ? 'image' : 'video',
        description: String(tool.description || '').slice(0, 1000),
        inputSchema: tool.inputSchema || null,
      })),
    }, session.setCookie);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
