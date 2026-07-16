import { listHiggsfieldJobs } from '../../_lib/higgsfield-jobs.js';
import { resolveWalletUser, walletErrorResponse, walletResponse } from '../../_lib/wallet.js';

export async function onRequestGet({ request, env }) {
  let session;
  try {
    session = await resolveWalletUser(request, env);
    const url = new URL(request.url);
    const jobs = await listHiggsfieldJobs(env.DB, session.userId, Number(url.searchParams.get('limit') || 30));
    return walletResponse({ ok: true, jobs }, session.setCookie);
  } catch (error) {
    return walletErrorResponse(error, session?.setCookie || null);
  }
}
