import { getHiggsfieldAccessToken, getHiggsfieldConnection, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import { isImageTool, isVideoTool } from '../../_lib/higgsfield-tools.js';
import { ensureHiggsfieldJobsSchema } from '../../_lib/higgsfield-jobs.js';
import { resolveWalletUser, walletResponse } from '../../_lib/wallet.js';

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    await ensureHiggsfieldJobsSchema(env.DB);
    const connection = await getHiggsfieldConnection(env.DB, env, session.userId);
    if (!connection) return walletResponse({ ok: true, connected: false, database: true }, session.setCookie);
    const accessToken = await getHiggsfieldAccessToken(env.DB, env, session.userId);
    const catalog = await listHiggsfieldTools(accessToken);
    return walletResponse({
      ok: true,
      connected: true,
      database: true,
      tools: catalog.tools.length,
      video: catalog.tools.some(isVideoTool),
      image: catalog.tools.some(isImageTool),
    }, session.setCookie);
  } catch (error) {
    return walletResponse({ ok: false, connected: false, database: Boolean(env.DB), message: String(error?.message || error) }, session?.setCookie || null, { status: 503 });
  }
}
