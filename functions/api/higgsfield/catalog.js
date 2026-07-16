import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import { isImageTool, isVideoTool, toolText } from '../../_lib/higgsfield-tools.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

const KNOWN_MODELS = [
  ['seedance-2.0', 'Seedance 2.0', 'video', /seedance[_ -]?2[_ -]?0/],
  ['seedance-2.0-mini', 'Seedance 2.0 Mini', 'video', /seedance[_ -]?2[_ -]?0[_ -]?mini/],
  ['kling-3.0', 'Kling 3.0', 'video', /kling[_ -]?3[_ -]?0/],
  ['kling-3.0-turbo', 'Kling 3.0 Turbo', 'video', /kling[_ -]?3[_ -]?0[_ -]?turbo/],
  ['hailuo', 'Hailuo', 'video', /hailuo|minimax/],
  ['gpt-image-2', 'GPT Image 2', 'image', /gpt[_ -]?image[_ -]?2/],
  ['nano-banana', 'Nano Banana', 'image', /nano[_ -]?banana/],
  ['seedream', 'Seedream', 'image', /seedream/],
  ['soul-2.0', 'Soul 2.0', 'image', /soul[_ -]?2/],
];

function discoverModels(tools) {
  const text = tools.map(toolText).join(' ');
  const found = KNOWN_MODELS.filter(([, , , pattern]) => pattern.test(text));
  if (found.length) return found.map(([id, name, kind]) => ({ id, name, kind }));
  return [
    { id: 'seedance-2.0', name: 'Seedance 2.0', kind: 'video' },
    { id: 'kling-3.0', name: 'Kling 3.0', kind: 'video' },
    { id: 'gpt-image-2', name: 'GPT Image 2', kind: 'image' },
  ];
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
      models: discoverModels(result.tools),
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
