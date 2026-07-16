import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    const accessToken = await getHiggsfieldAccessToken(env.DB, env, session.userId);
    const result = await listHiggsfieldTools(accessToken);
    return walletResponse({
      ok: true,
      provider: 'Higgsfield MCP',
      protocolVersion: result.protocolVersion,
      serverInfo: result.serverInfo,
      tools: result.tools.map(tool => ({
        name: tool.name,
        title: tool.title || null,
        description: tool.description || '',
        inputSchema: tool.inputSchema || null,
      })),
    }, session.setCookie);
  } catch (error) {
    console.error('higgsfield_tools_probe_failed', String(error?.message || error));
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
