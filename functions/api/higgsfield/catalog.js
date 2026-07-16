import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import { isImageTool, isVideoTool } from '../../_lib/higgsfield-detect.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

const PROVIDER_TOKEN = /\b(?:seedance|kling|veo|sora|hailuo|minimax|wan|pixverse|runway|luma|ray|vidu|ltx|hunyuan|mochi|cogvideo|gpt[_-]?image|nano[_-]?banana|seedream|flux|ideogram|recraft|imagen|stable[_-]?diffusion|sdxl|soul|qwen|hidream|photon|reve|cinema|firefly)[a-z0-9_.-]*\b/gi;

function titleCase(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function modelLabel(id) {
  const value = String(id || '');
  const known = [
    [/^kling3[_-]?0[_-]?turbo$/i, 'Kling 3.0 Turbo'],
    [/^kling3[_-]?0$/i, 'Kling 3.0'],
    [/^seedance[_-]?2[_-]?0$/i, 'Seedance 2.0'],
    [/^seedance$/i, 'Seedance Auto'],
    [/^nano[_-]?banana[_-]?pro$/i, 'Nano Banana Pro'],
    [/^soul[_-]?2$/i, 'Soul 2'],
    [/^soul[_-]?cast$/i, 'Soul Cast'],
    [/^soul[_-]?id$/i, 'Soul ID'],
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
    const inModelField = /(^|\.)(model|model_id|modelId)(\.|$)/i.test(nextPath);
    if (inModelField && ['enum', 'examples'].includes(key) && Array.isArray(value)) {
      value.filter(item => typeof item === 'string' && item.trim()).forEach(item => output.add(item.trim()));
    } else if (inModelField && ['const', 'default'].includes(key) && typeof value === 'string' && value.trim()) {
      output.add(value.trim());
    }
    collectModelValues(value, output, nextPath);
  }
  return output;
}

function collectDescriptionModels(tool, output = new Set()) {
  const text = String(tool?.description || '');
  for (const match of text.matchAll(PROVIDER_TOKEN)) {
    const value = String(match[0] || '').replace(/[.,;:)]+$/, '').trim();
    if (value.length >= 3 && value.length <= 80) output.add(value);
  }
  return output;
}

function discoverModels(generationTools) {
  const models = [];
  const seen = new Set();
  for (const tool of generationTools) {
    const kind = isImageTool(tool) ? 'image' : 'video';
    const values = collectDescriptionModels(tool, collectModelValues(tool.inputSchema));
    if (!values.size) values.add(kind === 'image' ? 'auto_image' : 'auto_video');
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
        source: clean.startsWith('auto_') ? 'tool-auto' : 'provider-catalog',
        autoModel: clean.startsWith('auto_'),
      });
    }
  }
  return models.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind));
}

function appCategory(tool) {
  const text = `${tool?.name || ''} ${tool?.title || ''} ${tool?.description || ''}`.toLowerCase();
  if (/marketing|ugc|product|ad\b|campaign/.test(text)) return 'Marketing';
  if (/website|webpage|app builder|landing page/.test(text)) return 'Web & Apps';
  if (/3d|glb|mesh|texture/.test(text)) return '3D';
  if (/audio|voice|lip.?sync|music|sound/.test(text)) return 'Audio';
  if (/upload|import|media|asset|library/.test(text)) return 'Media';
  if (/analysis|analy[sz]e|inspect|recommend|explore/.test(text)) return 'Analysis';
  if (/video|image|cinema|character|avatar|shorts/.test(text)) return 'Creative';
  return 'Utility';
}

function appList(tools) {
  return tools.map(tool => ({
    name: tool.name,
    title: tool.title || titleCase(tool.name),
    description: String(tool.description || '').replace(/\s+/g, ' ').slice(0, 220),
    category: isVideoTool(tool) || isImageTool(tool) ? 'Generation' : appCategory(tool),
    generation: isVideoTool(tool) || isImageTool(tool),
  })).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.title.localeCompare(b.title);
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
      apps: appList(result.tools),
      tools: generationTools.map(tool => ({
        name: tool.name,
        title: tool.title || tool.name,
        kind: isImageTool(tool) ? 'image' : 'video',
        description: String(tool.description || '').slice(0, 2000),
        inputSchema: tool.inputSchema || null,
      })),
    }, session.setCookie);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
