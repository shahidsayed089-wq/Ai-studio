import { validateWorkflow } from "../workflow-domain.js";

const DEFAULT_QUEUE_BASE_URL = "https://queue.fal.run";
const DEFAULT_STORAGE_BASE_URL = "https://rest.fal.ai";
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024;

const MODEL_CREDITS = Object.freeze({
  gpt_image_2: { fixed: 20 },
  nano_banana_2: { fixed: 15 },
  nano_banana_pro: { fixed: 25 },
  grok_imagine_image: { fixed: 4 },
  flux_2_pro: { fixed: 12 },
  seedance_2_0_standard: { perSecond: 38, minimum: 152 },
  seedance_2_0_fast: { perSecond: 31, minimum: 124 },
  seedance_2_0_mini: { perSecond: 24, minimum: 96 },
  kling_3_0: { perSecond: 32, minimum: 160 },
  kling_3_0_omni: { perSecond: 53, minimum: 265 },
  gemini_omni_flash: { perSecond: 50, minimum: 200 },
  grok_imagine_video_1_5: { perSecond: 18, minimum: 90 },
  veo_3_1: { perSecond: 50, minimum: 200 },
  happy_horse_1_1: { perSecond: 32, minimum: 160 },
  lyria_3: { fixed: 300 },
  audioflow_elevenlabs: { perSecond: 4, minimum: 120 },
  score_composer_cassetteai: { perSecond: 3, minimum: 90 },
  elevenlabs_voice: { fixed: 25 },
  multilingual_pro: { fixed: 25 },
  voice_forge: { fixed: 35 },
  heygen_avatar_iv: { fixed: 500 },
  avatar_one: { fixed: 500 },
  digital_twin: { fixed: 500 },
  performance_capture: { fixed: 500 },
});

const clean = (value, maximum = 5000) => typeof value === "string" ? value.normalize("NFKC").trim().slice(0, maximum) : "";
const clampInteger = (value, minimum, maximum, fallback) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};
const aspect = (value, allowed = ["16:9", "9:16", "1:1"]) => allowed.includes(value) ? value : allowed[0];
const resolution = (value, allowed, fallback) => allowed.includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : fallback;
const headers = (key, extra = {}) => ({ Accept: "application/json", Authorization: `Key ${key}`, ...extra });

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { message: "fal.ai returned an unreadable response." }; }
};

const providerMessage = (payload, fallback) => {
  const candidates = [payload?.message, payload?.detail, payload?.error, payload?.msg];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 500);
    if (candidate && typeof candidate.message === "string") return candidate.message.trim().slice(0, 500);
  }
  return fallback;
};

const providerError = (payload, fallback, status) => {
  const error = new Error(providerMessage(payload, fallback));
  error.code = "FAL_UPSTREAM_ERROR";
  error.status = Number(status) || 502;
  error.retryable = error.status === 408 || error.status === 409 || error.status === 425 || error.status === 429 || error.status >= 500;
  return error;
};

const toBase64Url = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
};

export const encodeFalRequestId = (modelPath, requestId) => `fal.${toBase64Url(modelPath)}.${requestId}`;

export const decodeFalRequestId = (value) => {
  const parts = String(value || "").split(".");
  if (parts.length !== 3 || parts[0] !== "fal") return null;
  try {
    const modelPath = fromBase64Url(parts[1]);
    if (!/^[a-zA-Z0-9._/-]{3,180}$/.test(modelPath) || !/^[a-zA-Z0-9_-]{5,160}$/.test(parts[2])) return null;
    return { modelPath, requestId: parts[2] };
  } catch { return null; }
};

const workflowInput = (workflow) => {
  const validation = validateWorkflow(workflow);
  if (!validation.ok) return { error: validation.error };
  const promptNode = validation.workflow.nodes.find((node) => node.type === "text_prompt");
  const generationNodes = validation.workflow.nodes.filter((node) => [
    "image_generator", "image_to_video", "text_to_video", "video_upscaler",
  ].includes(node.type));
  if (generationNodes.length !== 1) return { error: "Live fal.ai execution mein exactly one generation node required hai; multi-step Pro Canvas abhi Demo Provider par test karein." };
  const generationNode = generationNodes[0];
  if (!generationNode) return { error: "Generation node required." };
  const model = clean(generationNode.data?.model, 120);
  const prompt = clean(promptNode?.data?.prompt, 5000);
  const referenceAssetIds = clean(generationNode.data?.reference_asset_ids, 2000)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 15);
  return {
    validation,
    generationNode,
    model,
    prompt,
    referenceAssetIds,
    aspectRatio: clean(generationNode.data?.aspect_ratio, 20) || "16:9",
    resolution: clean(generationNode.data?.resolution, 20) || "720p",
    duration: clampInteger(generationNode.data?.duration, 1, 180, 5),
  };
};

const buildSeedanceTask = (input, references) => {
  const tier = input.model === "seedance_2_0_fast" ? "/fast" : input.model === "seedance_2_0_mini" ? "/mini" : "";
  const base = `bytedance/seedance-2.0${tier}`;
  const images = references.filter((item) => item.kind === "image").slice(0, 9).map((item) => item.url);
  const videos = references.filter((item) => item.kind === "video").slice(0, 3).map((item) => item.url);
  const audio = references.filter((item) => item.kind === "file" && item.contentType.startsWith("audio/")).slice(0, 3).map((item) => item.url);
  const body = {
    prompt: input.prompt,
    resolution: resolution(input.resolution, tier ? ["480p", "720p"] : ["480p", "720p", "1080p"], tier ? "720p" : "1080p"),
    duration: String(clampInteger(input.duration, 4, 15, 5)),
    aspect_ratio: aspect(input.aspectRatio, ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]),
    generate_audio: true,
  };
  if (videos.length || audio.length || images.length > 1) {
    if (images.length) body.image_urls = images;
    if (videos.length) body.video_urls = videos;
    if (audio.length) body.audio_urls = audio;
    return { modelPath: `${base}/reference-to-video`, input: body };
  }
  if (images[0]) return { modelPath: `${base}/image-to-video`, input: { ...body, image_url: images[0] } };
  return { modelPath: `${base}/text-to-video`, input: body };
};

const buildVideoTask = (input, references) => {
  if (input.model.startsWith("seedance_2_0_")) return buildSeedanceTask(input, references);
  const images = references.filter((item) => item.kind === "image").slice(0, 2).map((item) => item.url);
  const duration = String(clampInteger(input.duration, 3, 15, 5));
  if (input.model === "kling_3_0_omni") {
    if (!images[0]) return { error: "Kling 3.0 Omni 4K ke liye first-frame image required hai." };
    return {
      modelPath: "fal-ai/kling-video/o3/4k/image-to-video",
      input: { prompt: input.prompt, image_url: images[0], end_image_url: images[1] || undefined, duration, generate_audio: true },
    };
  }
  if (input.model === "kling_3_0") {
    return images[0]
      ? { modelPath: "fal-ai/kling-video/v3/pro/image-to-video", input: { prompt: input.prompt, start_image_url: images[0], end_image_url: images[1] || undefined, duration, generate_audio: true } }
      : { modelPath: "fal-ai/kling-video/v3/pro/text-to-video", input: { prompt: input.prompt, aspect_ratio: aspect(input.aspectRatio), duration, generate_audio: true } };
  }
  if (input.model === "grok_imagine_video_1_5") {
    if (!images[0]) return { error: "Grok Imagine Video 1.5 ke liye first-frame image required hai." };
    return { modelPath: "xai/grok-imagine-video/v1.5/image-to-video", input: { prompt: input.prompt, image_url: images[0], duration: clampInteger(input.duration, 3, 15, 6), resolution: resolution(input.resolution, ["480p", "720p", "1080p"], "720p") } };
  }
  if (input.model === "veo_3_1") {
    const common = { prompt: input.prompt, aspect_ratio: aspect(input.aspectRatio, ["16:9", "9:16"]), duration: clampInteger(input.duration, 4, 8, 8), generate_audio: true };
    if (images.length > 1) return { modelPath: "fal-ai/veo3.1/first-last-frame-to-video", input: { ...common, first_frame_url: images[0], last_frame_url: images[1] } };
    if (images[0]) return { modelPath: "fal-ai/veo3.1/image-to-video", input: { ...common, image_url: images[0] } };
    return { modelPath: "fal-ai/veo3.1", input: common };
  }
  if (input.model === "gemini_omni_flash") {
    const common = { prompt: input.prompt, aspect_ratio: aspect(input.aspectRatio, ["16:9", "9:16"]), duration: clampInteger(input.duration, 3, 10, 8) };
    return images.length
      ? { modelPath: "google/gemini-omni-flash/reference-to-video", input: { ...common, image_urls: images } }
      : { modelPath: "google/gemini-omni-flash", input: common };
  }
  if (input.model === "happy_horse_1_1") {
    const common = { prompt: input.prompt, resolution: resolution(input.resolution, ["720p", "1080p"], "720p"), duration: clampInteger(input.duration, 5, 15, 5) };
    return images[0]
      ? { modelPath: "alibaba/happy-horse/v1.1/image-to-video", input: { ...common, image_url: images[0] } }
      : { modelPath: "alibaba/happy-horse/v1.1/text-to-video", input: { ...common, aspect_ratio: aspect(input.aspectRatio, ["16:9", "9:16", "1:1", "4:3", "3:4"]) } };
  }
  return null;
};

const buildImageTask = (input, references) => {
  const images = references.filter((item) => item.kind === "image").slice(0, 14).map((item) => item.url);
  const common = { prompt: input.prompt, aspect_ratio: aspect(input.aspectRatio, ["16:9", "9:16", "1:1", "4:3", "3:4"]), num_images: 1 };
  if (input.model === "gpt_image_2") return images.length
    ? { modelPath: "openai/gpt-image-2/edit", input: { ...common, image_urls: images } }
    : { modelPath: "openai/gpt-image-2", input: common };
  if (input.model === "nano_banana_2") return images.length
    ? { modelPath: "fal-ai/nano-banana-2/edit", input: { ...common, image_urls: images, resolution: "2K" } }
    : { modelPath: "fal-ai/nano-banana-2", input: { ...common, resolution: "2K" } };
  if (input.model === "nano_banana_pro") return images.length
    ? { modelPath: "fal-ai/nano-banana-pro/edit", input: { ...common, image_urls: images, resolution: "2K" } }
    : { modelPath: "fal-ai/nano-banana-pro", input: { ...common, resolution: "2K" } };
  if (input.model === "flux_2_pro") return { modelPath: "fal-ai/flux-2-pro", input: common };
  if (input.model === "grok_imagine_image") return images.length
    ? { modelPath: "xai/grok-imagine-image/quality/edit", input: { ...common, image_urls: images } }
    : { modelPath: "xai/grok-imagine-image", input: common };
  return null;
};

const buildAudioTask = (input, references) => {
  const firstImage = references.find((item) => item.kind === "image")?.url;
  const firstAudio = references.find((item) => item.contentType.startsWith("audio/"))?.url;
  const firstVideo = references.find((item) => item.kind === "video")?.url;
  if (input.model === "lyria_3") return { modelPath: "fal-ai/lyria3", input: { prompt: input.prompt } };
  if (input.model === "audioflow_elevenlabs") return { modelPath: "fal-ai/elevenlabs/music", input: { prompt: input.prompt, music_length_ms: clampInteger(input.duration, 30, 180, 30) * 1000, force_instrumental: false, output_format: "mp3_44100_128" } };
  if (input.model === "score_composer_cassetteai") return { modelPath: "CassetteAI/music-generator", input: { prompt: input.prompt, duration: clampInteger(input.duration, 30, 180, 30) } };
  if (input.model === "elevenlabs_voice") return { modelPath: "fal-ai/elevenlabs/tts/eleven-v3", input: { text: input.prompt, voice: "Rachel", stability: 0.5, apply_text_normalization: "auto" } };
  if (input.model === "multilingual_pro") return { modelPath: "fal-ai/elevenlabs/tts/multilingual-v2", input: { text: input.prompt, voice: "Rachel", stability: 0.5, similarity_boost: 0.75, speed: 1, apply_text_normalization: "auto" } };
  if (input.model === "voice_forge") return { modelPath: "fal-ai/elevenlabs/text-to-voice/design/eleven-v3", input: { prompt: input.prompt, auto_generate_text: true, output_format: "mp3_44100_128" } };
  if (input.model === "heygen_avatar_iv") {
    if (!firstImage) return { error: "HeyGen Avatar IV ke liye clear-face image required hai." };
    return { modelPath: "fal-ai/heygen/avatar4/image-to-video", input: { image_url: firstImage, prompt: input.prompt, audio_url: firstAudio || undefined, talking_style: "expressive", resolution: resolution(input.resolution, ["720p", "1080p"], "720p") } };
  }
  if (input.model === "avatar_one") {
    if (!firstImage || !firstAudio) return { error: "Avatar One ke liye image aur audio required hain." };
    return { modelPath: "fal-ai/kling-video/ai-avatar/v2/standard", input: { image_url: firstImage, audio_url: firstAudio, prompt: input.prompt || "." } };
  }
  if (input.model === "digital_twin") {
    if (!firstImage || !firstAudio) return { error: "Digital Twin ke liye image aur audio required hain." };
    return { modelPath: "fal-ai/bytedance/omnihuman", input: { image_url: firstImage, audio_url: firstAudio } };
  }
  if (input.model === "performance_capture") {
    if (!firstImage || !firstVideo) return { error: "Performance Capture ke liye image aur driving video required hain." };
    return { modelPath: "fal-ai/wan-motion", input: { image_url: firstImage, video_url: firstVideo, prompt: input.prompt, acceleration: "regular", adapt_motion: true, enable_safety_checker: true } };
  }
  return null;
};

export const buildFalTask = (workflow, references = []) => {
  const input = workflowInput(workflow);
  if (input.error) return { error: input.error };
  if (!MODEL_CREDITS[input.model]) return { error: `Selected model "${input.model || "unknown"}" fal.ai par connected nahi hai.` };
  const task = buildVideoTask(input, references) || buildImageTask(input, references) || buildAudioTask(input, references);
  return task || { error: `Selected model "${input.model}" ke liye live task available nahi hai.` };
};

const uploadReference = async (env, key, asset, object) => {
  if (Number(asset.size_bytes) > MAX_REFERENCE_BYTES) throw new Error("Reference file 25 MB se chhoti honi chahiye.");
  const bytes = await object.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_REFERENCE_BYTES) throw new Error("Reference file 25 MB se chhoti honi chahiye.");
  const storageBase = clean(env.FAL_STORAGE_BASE_URL, 300) || DEFAULT_STORAGE_BASE_URL;
  const safeName = clean(asset.filename, 120).replace(/[^a-zA-Z0-9._-]+/g, "-") || "reference";
  const initiate = await fetch(`${storageBase.replace(/\/$/, "")}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
    method: "POST",
    headers: headers(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ file_name: `${crypto.randomUUID()}-${safeName}`, content_type: asset.content_type }),
  });
  const payload = await readJson(initiate);
  if (!initiate.ok) throw providerError(payload, "Secure reference upload start nahi hua.", initiate.status);
  if (!/^https:\/\//i.test(payload?.upload_url || "") || !/^https:\/\//i.test(payload?.file_url || "")) {
    throw providerError(payload, "Secure reference upload URL nahi mila.", 502);
  }
  const uploaded = await fetch(payload.upload_url, { method: "PUT", headers: { "Content-Type": asset.content_type }, body: bytes });
  if (!uploaded.ok) throw providerError({}, `Reference upload failed (${uploaded.status}).`, uploaded.status);
  return { url: payload.file_url, kind: asset.kind, contentType: asset.content_type };
};

const resolveReferences = async (env, key, userId, workflow) => {
  const input = workflowInput(workflow);
  if (input.error || !input.referenceAssetIds.length) return [];
  if (!env.DB?.prepare || !env.MEDIA?.get) throw new Error("Private asset bindings unavailable.");
  const placeholders = input.referenceAssetIds.map(() => "?").join(",");
  const result = await env.DB.prepare(`SELECT id,kind,filename,content_type,size_bytes,r2_key
    FROM shazan_assets_v1 WHERE owner_id=? AND deleted_at IS NULL AND id IN (${placeholders})`)
    .bind(userId, ...input.referenceAssetIds).all();
  const rows = result.results || [];
  if (rows.length !== input.referenceAssetIds.length) throw new Error("Reference asset unavailable.");
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const uploaded = [];
  for (const assetId of input.referenceAssetIds) {
    const asset = rowMap.get(assetId);
    const object = await env.MEDIA.get(asset.r2_key);
    if (!object) throw new Error("Reference asset data unavailable.");
    uploaded.push(await uploadReference(env, key, asset, object));
  }
  return uploaded;
};

const collectHttpsUrls = (value, limit = 20) => {
  const urls = [];
  const objects = new Set();
  const visit = (entry, path = "result") => {
    if (urls.length >= limit) return;
    if (typeof entry === "string" && /^https:\/\//i.test(entry) && !/status|cancel|webhook/i.test(path)) {
      if (!urls.includes(entry)) urls.push(entry);
      return;
    }
    if (!entry || typeof entry !== "object" || objects.has(entry)) return;
    objects.add(entry);
    if (Array.isArray(entry)) return entry.forEach((item, index) => visit(item, `${path}.${index}`));
    Object.entries(entry).forEach(([key, item]) => visit(item, `${path}.${key}`));
  };
  visit(value);
  return urls;
};

const outputType = (url, result) => {
  const explicit = result?.video?.content_type || result?.image?.content_type || result?.audio?.content_type;
  if (typeof explicit === "string" && /^(image|video|audio)\//.test(explicit)) return explicit.split("/")[0];
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(url)) return "audio";
  return "image";
};

export const falKeyFromEnv = (env = {}) => clean(
  env?.FAL_KEY
    || env?.FAL_AI_KEY
    || env?.["Fal ai"]
    || env?.["Fal AI"],
  1000,
);

export class FalProviderAdapter {
  key = "fal";

  validateConfiguration(env) {
    const key = falKeyFromEnv(env);
    return key.length >= 16
      ? { ok: true, mode: "live", secretRequired: true }
      : { ok: false, error: "FAL_KEY production secret configured nahi hai." };
  }

  validateInput({ workflow } = {}) {
    const input = workflowInput(workflow);
    if (input.error) return { ok: false, error: input.error };
    if (!input.prompt || input.prompt.length < 2) return { ok: false, error: "Prompt required hai." };
    if (!MODEL_CREDITS[input.model]) return { ok: false, error: `Selected model "${input.model || "unknown"}" fal.ai par connected nahi hai.` };
    return { ok: true, model: input.model };
  }

  estimateProviderCost({ workflow } = {}) {
    const input = workflowInput(workflow);
    if (input.error || !MODEL_CREDITS[input.model]) return { ok: false, currency: "USD", amount: 0 };
    const cost = this.calculateCost(workflow);
    return { ok: cost.ok, currency: "USD", amount: cost.credits / 100 };
  }

  estimateCreditCost({ workflow } = {}) {
    return this.calculateCost(workflow);
  }

  async submitJob({ workflow, env, userId }) {
    const key = falKeyFromEnv(env);
    if (key.length < 16) throw new Error("FAL_KEY production secret configured nahi hai.");
    const references = await resolveReferences(env, key, userId, workflow);
    const task = buildFalTask(workflow, references);
    if (task.error) throw new Error(task.error);
    const queueBase = (clean(env.FAL_QUEUE_BASE_URL, 300) || DEFAULT_QUEUE_BASE_URL).replace(/\/$/, "");
    const response = await fetch(`${queueBase}/${task.modelPath}`, {
      method: "POST",
      headers: headers(key, { "Content-Type": "application/json" }),
      body: JSON.stringify(task.input),
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(payload, "fal.ai generation request accept nahi hui.", response.status);
    if (!/^[a-zA-Z0-9_-]{5,160}$/.test(payload?.request_id || "")) throw providerError(payload, "fal.ai request ID missing hai.", 502);
    return { accepted: true, providerRequestId: encodeFalRequestId(task.modelPath, payload.request_id), modelPath: task.modelPath };
  }

  async getJobStatus({ providerRequestId, env }) {
    const encoded = decodeFalRequestId(providerRequestId);
    if (!encoded) throw new Error("Invalid fal.ai provider request ID.");
    const key = falKeyFromEnv(env);
    if (key.length < 16) throw new Error("FAL_KEY production secret configured nahi hai.");
    const queueBase = (clean(env.FAL_QUEUE_BASE_URL, 300) || DEFAULT_QUEUE_BASE_URL).replace(/\/$/, "");
    const requestBase = `${queueBase}/${encoded.modelPath}/requests/${encodeURIComponent(encoded.requestId)}`;
    const response = await fetch(`${requestBase}/status?logs=1`, { headers: headers(key) });
    const payload = await readJson(response);
    if (!response.ok) throw providerError(payload, "fal.ai render status unavailable hai.", response.status);
    const status = String(payload?.status || "IN_QUEUE").toUpperCase();
    if (status === "FAILED") return { status: "failed", progress: 100, error: providerMessage(payload, "fal.ai generation failed."), retryable: false };
    if (status === "IN_PROGRESS") return { status: "processing", progress: Math.min(95, Math.max(15, Number(payload?.progress) || 35)) };
    if (status !== "COMPLETED") return { status: "queued", progress: Math.min(14, Math.max(1, Number(payload?.progress) || 5)) };
    const resultResponse = await fetch(requestBase, { headers: headers(key) });
    const result = await readJson(resultResponse);
    if (!resultResponse.ok) throw providerError(result, "fal.ai completed result unavailable hai.", resultResponse.status);
    return { status: "completed", progress: 100, result };
  }

  async cancelJob({ providerRequestId, env }) {
    const encoded = decodeFalRequestId(providerRequestId);
    if (!encoded) return { status: "cancelled", remote: false };
    const key = falKeyFromEnv(env);
    if (key.length < 16) return { status: "cancelled", remote: false };
    const queueBase = (clean(env.FAL_QUEUE_BASE_URL, 300) || DEFAULT_QUEUE_BASE_URL).replace(/\/$/, "");
    const url = `${queueBase}/${encoded.modelPath}/requests/${encodeURIComponent(encoded.requestId)}/cancel`;
    const response = await fetch(url, { method: "PUT", headers: headers(key) });
    if (!response.ok && ![404, 409].includes(response.status)) {
      const payload = await readJson(response);
      throw providerError(payload, "fal.ai cancellation unavailable hai.", response.status);
    }
    return { status: "cancelled", remote: response.ok };
  }

  normalizeResult(result) {
    const urls = collectHttpsUrls(result);
    const url = urls[0] || "";
    if (!url) throw new Error("fal.ai completed hua lekin media URL missing hai.");
    return { provider: "fal", mode: "live", url, urls, type: outputType(url, result), raw: result };
  }

  normalizeError(error) {
    return {
      code: clean(error?.code, 80) || "FAL_PROVIDER_ERROR",
      message: clean(error?.message, 500) || "fal.ai request failed.",
      retryable: Boolean(error?.retryable),
    };
  }

  handleWebhook(payload) {
    return { accepted: true, payload };
  }

  async verifyWebhook() {
    return false;
  }

  async checkAvailability(env) {
    return { available: this.validateConfiguration(env).ok, mode: "live" };
  }

  calculateCost(workflow) {
    const input = workflowInput(workflow);
    if (input.error) return { ok: false, error: input.error, credits: 0 };
    const pricing = MODEL_CREDITS[input.model];
    if (!pricing) return { ok: false, error: `Selected model "${input.model || "unknown"}" fal.ai par connected nahi hai.`, credits: 0 };
    const credits = pricing.fixed || Math.max(pricing.minimum || 1, Math.ceil(pricing.perSecond * input.duration));
    return { ok: true, credits, breakdown: [{ node_id: input.generationNode.id, type: input.generationNode.type, model: input.model, credits }] };
  }
}

export const falProvider = new FalProviderAdapter();
