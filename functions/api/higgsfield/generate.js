import { getHiggsfieldAccessToken, listHiggsfieldTools } from '../../_lib/higgsfield.js';
import {
  buildGenerationArguments,
  buildMediaImportArguments,
  callHiggsfieldTool,
  extractToolResult,
  findMediaImportTool,
} from '../../_lib/higgsfield-tools.js';
import { selectGenerationTool } from '../../_lib/higgsfield-detect.js';
import { createHiggsfieldJob, updateHiggsfieldJob } from '../../_lib/higgsfield-jobs.js';
import { resolveWalletUser, walletErrorResponse, walletResponse, WalletError } from '../../_lib/wallet.js';

const KINDS = new Set(['video', 'image']);
const ASPECTS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
const RESOLUTIONS = new Set(['720p', '1080p', '2k', '4k']);
const DURATIONS = new Set([5, 10, 15]);

function cleanUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function providerError(error) {
  const message = String(error?.message || 'Higgsfield generation failed.');
  const status = Number(error?.status);
  return { message: message.slice(0, 600), status: status >= 400 && status < 600 ? status : 502 };
}

export async function onRequestPost({ request, env }) {
  let session;
  let jobId;
  try {
    session = await resolveWalletUser(request, env);
    let body;
    try { body = await request.json(); }
    catch { throw new WalletError('invalid_json', 'Send a valid generation request.', 400); }

    const kind = KINDS.has(body.kind) ? body.kind : 'video';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 3 || prompt.length > 6000) {
      throw new WalletError('invalid_prompt', 'Prompt must be between 3 and 6000 characters.', 400);
    }

    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : (kind === 'image' ? 'gpt_image_2' : 'seedance_2_0');
    const aspectRatio = ASPECTS.has(body.aspectRatio) ? body.aspectRatio : '9:16';
    const resolution = RESOLUTIONS.has(body.resolution) ? body.resolution : '720p';
    const durationNumber = Number(body.duration);
    const duration = kind === 'video' && DURATIONS.has(durationNumber) ? durationNumber : 5;
    const negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim().slice(0, 1500) : '';
    const seed = Number.isInteger(body.seed) ? body.seed : undefined;
    const referenceUrls = (Array.isArray(body.referenceUrls) ? body.referenceUrls : [])
      .map(cleanUrl).filter(Boolean).slice(0, 3);

    const accessToken = await getHiggsfieldAccessToken(env.DB, env, session.userId);
    const catalog = await listHiggsfieldTools(accessToken);
    const generationTool = selectGenerationTool(catalog.tools, kind, body.toolName);
    if (!generationTool) {
      throw new WalletError('generation_tool_unavailable', `No ${kind} generation tool is available on this Higgsfield account.`, 503);
    }

    const mediaIds = [];
    if (referenceUrls.length) {
      const importTool = findMediaImportTool(catalog.tools);
      if (!importTool) {
        throw new WalletError('reference_import_unavailable', 'This Higgsfield connection cannot import reference URLs yet.', 400);
      }
      for (const url of referenceUrls) {
        const imported = await callHiggsfieldTool(accessToken, importTool.name, buildMediaImportArguments(importTool, url));
        const parsed = extractToolResult(imported);
        if (!parsed.providerJobId) throw new WalletError('reference_import_failed', 'Higgsfield did not return a media reference ID.', 502);
        mediaIds.push(parsed.providerJobId);
      }
    }

    const generationInput = {
      prompt,
      model,
      aspectRatio,
      resolution,
      duration,
      generateAudio: kind === 'video' && body.generateAudio !== false,
      negativePrompt,
      seed,
      mediaIds,
    };
    const args = buildGenerationArguments(generationTool, generationInput);
    jobId = crypto.randomUUID();
    await createHiggsfieldJob(env.DB, {
      id: jobId,
      userId: session.userId,
      kind,
      toolName: generationTool.name,
      model,
      prompt,
      request: { ...generationInput, referenceUrls, args },
    });

    const result = await callHiggsfieldTool(accessToken, generationTool.name, args);
    const parsed = extractToolResult(result);
    const job = await updateHiggsfieldJob(env.DB, jobId, session.userId, {
      status: parsed.status,
      providerJobId: parsed.providerJobId,
      outputUrl: parsed.mediaUrl,
      result,
      errorMessage: parsed.status === 'failed' ? (parsed.text || 'Higgsfield reported a failed generation.') : null,
    });

    return walletResponse({
      ok: true,
      job,
      providerMessage: parsed.text || null,
      note: parsed.status === 'submitted'
        ? 'Generation submitted. Status will refresh from the gallery.'
        : null,
    }, session.setCookie, { status: parsed.status === 'completed' ? 200 : 202 });
  } catch (error) {
    if (jobId && session?.userId) {
      await updateHiggsfieldJob(env.DB, jobId, session.userId, {
        status: 'failed',
        errorMessage: String(error?.message || 'Generation failed.').slice(0, 600),
      }).catch(() => {});
    }
    if (error instanceof WalletError) return walletErrorResponse(error, session?.setCookie || null);
    const normalized = providerError(error);
    return walletResponse({ error: 'higgsfield_generation_failed', message: normalized.message }, session?.setCookie || null, { status: normalized.status });
  }
}
