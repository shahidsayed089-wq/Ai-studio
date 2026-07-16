import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../../_lib/higgsfield.js';
import {
  buildStatusArguments,
  callHiggsfieldTool,
  extractToolResult,
  findStatusTool,
} from '../../../_lib/higgsfield-tools.js';
import { getHiggsfieldJob, updateHiggsfieldJob } from '../../../_lib/higgsfield-jobs.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../../_lib/wallet.js';

export async function onRequestGet({ request, env, params }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    let job = await getHiggsfieldJob(env.DB, String(params.id || ''), session.userId);
    const canRefresh = ['running', 'submitted'].includes(job.status) && job.providerJobId;

    if (canRefresh) {
      const accessToken = await getHiggsfieldAccessToken(env.DB, env, session.userId);
      const catalog = await listHiggsfieldTools(accessToken);
      const statusTool = findStatusTool(catalog.tools);
      if (statusTool) {
        try {
          const result = await callHiggsfieldTool(accessToken, statusTool.name, buildStatusArguments(statusTool, job.providerJobId));
          const parsed = extractToolResult(result);
          job = await updateHiggsfieldJob(env.DB, job.id, session.userId, {
            status: parsed.status,
            providerJobId: parsed.providerJobId || job.providerJobId,
            outputUrl: parsed.mediaUrl,
            result,
            errorMessage: parsed.status === 'failed' ? (parsed.text || 'Generation failed.') : null,
          });
        } catch (error) {
          console.warn('higgsfield_status_refresh_failed', job.id, String(error?.message || error));
        }
      }
    }

    return walletResponse({ ok: true, job }, session.setCookie);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
