const KIE_API_BASE_URL = "https://api.kie.ai";
const KIE_UPLOAD_BASE_URL = "https://kieai.redpandaai.co";
const FAL_QUEUE_BASE_URL = "https://queue.fal.run";
const FAL_STORAGE_BASE_URL = "https://rest.fal.ai";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const KIE_MARKET_MODELS = {
  seedance_2_0_standard: "bytedance/seedance-2",
  seedance_2_0_fast: "bytedance/seedance-2-fast",
  seedance_2_0_mini: "bytedance/seedance-2-mini",
  kling_3_0_elements: "kling-3.0/video",
  runway_gen_4_5: "runway_gen_4_5",
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  },
});

const getFalKey = (env) => typeof env.FAL_KEY === "string" ? env.FAL_KEY.trim() : "";
const getKieKey = (env) => typeof env.KIE_API_KEY === "string" ? env.KIE_API_KEY.trim() : "";
const getKieApiBase = (env) => (env.KIE_API_BASE_URL || KIE_API_BASE_URL).replace(/\/$/, "");
const getKieUploadBase = (env) => (env.KIE_UPLOAD_BASE_URL || KIE_UPLOAD_BASE_URL).replace(/\/$/, "");

const falHeaders = (apiKey, extra = {}) => ({
  Accept: "application/json",
  Authorization: `Key ${apiKey}`,
  ...extra,
});

const kieHeaders = (apiKey, extra = {}) => ({
  Accept: "application/json",
  Authorization: `Bearer ${apiKey}`,
  ...extra,
});

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: "Render service returned an unreadable response." };
  }
};

const getErrorMessage = (payload, fallback) => {
  const candidates = [payload?.message, payload?.detail, payload?.error, payload?.msg];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() && candidate.length < 500) return candidate;
    if (candidate && typeof candidate === "object" && typeof candidate.message === "string") return candidate.message;
  }
  return fallback;
};

const upstreamError = (payload, fallback, status = 502) => json({
  error: fallback,
  message: getErrorMessage(payload, fallback),
  service_code: typeof payload?.code === "number" ? payload.code : undefined,
}, status);

const cleanHttpsUrls = (value, limit) => Array.isArray(value)
  ? value.filter((item) => typeof item === "string" && /^https:\/\//i.test(item)).slice(0, limit)
  : [];

const normalizeResolution = (value, allowed, fallback) => {
  const raw = String(value || "");
  const candidate = raw.toLowerCase() === "4k" ? "4k" : raw.toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
};

const normalizeAspect = (value, allowed = ["16:9", "9:16", "1:1"]) => allowed.includes(value) ? value : "16:9";

const normalizeDuration = (value, minimum = 3, maximum = 15, fallback = 5) => {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return Math.min(maximum, Math.max(minimum, fallback));
  return Math.min(maximum, Math.max(minimum, Math.round(duration)));
};

const firstHttpsUrl = (...values) => values.find((item) => typeof item === "string" && /^https:\/\//i.test(item)) || "";

const getImageReferences = (args, limit = 9) => {
  const references = cleanHttpsUrls(args.image_references, limit);
  const startImage = firstHttpsUrl(args.start_image, args.image_url);
  if (startImage && !references.includes(startImage)) references.unshift(startImage);
  const endImage = firstHttpsUrl(args.end_image);
  if (endImage && !references.includes(endImage) && references.length < limit) references.push(endImage);
  return references.slice(0, limit);
};

const buildFalSeedanceTask = (model, args) => {
  const isFast = model === "seedance_2_0_fast";
  const base = `bytedance/seedance-2.0${isFast ? "/fast" : ""}`;
  const images = getImageReferences(args, 9);
  const videos = cleanHttpsUrls(args.video_references, 3);
  const audio = cleanHttpsUrls(args.audio_references, 3);
  const input = {
    prompt: args.prompt.trim(),
    resolution: normalizeResolution(args.resolution, ["480p", "720p", "1080p", "4k"], isFast ? "720p" : "1080p"),
    duration: normalizeDuration(args.duration, 4, 15, 5),
    aspect_ratio: normalizeAspect(args.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]),
    generate_audio: args.generate_audio !== false,
  };

  if (videos.length || audio.length || images.length > 1) {
    if (images.length) input.image_urls = images;
    if (videos.length) input.video_urls = videos;
    if (audio.length) input.audio_urls = audio;
    return { provider: "fal", modelPath: `${base}/reference-to-video`, input };
  }
  if (images[0]) {
    input.image_url = images[0];
    return { provider: "fal", modelPath: `${base}/image-to-video`, input };
  }
  return { provider: "fal", modelPath: `${base}/text-to-video`, input };
};

const buildFalKlingTask = (model, args) => {
  const images = getImageReferences(args, 2);
  const duration = String(normalizeDuration(args.duration, 3, 15, 5));
  const common = {
    prompt: args.prompt.trim(),
    duration,
    generate_audio: args.sound !== "off" && args.sound !== false,
  };

  if (model === "kling_3_0_omni") {
    if (!images[0]) return { validationError: "Kling 3.0 Omni 4K ke liye ek first-frame image required hai." };
    return {
      provider: "fal",
      modelPath: "fal-ai/kling-video/o3/4k/image-to-video",
      input: { ...common, image_url: images[0], end_image_url: images[1] || undefined },
    };
  }

  if (images[0]) {
    return {
      provider: "fal",
      modelPath: "fal-ai/kling-video/v3/pro/image-to-video",
      input: { ...common, start_image_url: images[0], end_image_url: images[1] || undefined },
    };
  }
  return {
    provider: "fal",
    modelPath: "fal-ai/kling-video/v3/pro/text-to-video",
    input: { ...common, aspect_ratio: normalizeAspect(args.aspect_ratio) },
  };
};

const buildFalGeminiOmniTask = (args) => {
  const images = getImageReferences(args, 7);
  const input = {
    prompt: args.prompt.trim(),
    aspect_ratio: normalizeAspect(args.aspect_ratio, ["16:9", "9:16"]),
    duration: normalizeDuration(args.duration, 3, 10, 8),
  };
  if (images.length) {
    input.image_urls = images;
    return { provider: "fal", modelPath: "google/gemini-omni-flash/reference-to-video", input };
  }
  return { provider: "fal", modelPath: "google/gemini-omni-flash", input };
};

const buildFalGrokVideoTask = (args) => {
  const image = getImageReferences(args, 1)[0];
  if (!image) return { validationError: "Grok Imagine Video 1.5 ke liye ek first-frame image required hai." };
  return {
    provider: "fal",
    modelPath: "xai/grok-imagine-video/v1.5/image-to-video",
    input: {
      prompt: args.prompt.trim(),
      image_url: image,
      duration: normalizeDuration(args.duration, 3, 15, 6),
      resolution: normalizeResolution(args.resolution, ["480p", "720p", "1080p"], "720p"),
    },
  };
};

const buildFalHappyHorseTask = (args) => {
  const image = getImageReferences(args, 1)[0];
  const input = {
    prompt: args.prompt.trim(),
    resolution: normalizeResolution(args.resolution, ["720p", "1080p"], "720p"),
    duration: normalizeDuration(args.duration, 5, 15, 5),
  };
  if (image) {
    input.image_url = image;
    return { provider: "fal", modelPath: "alibaba/happy-horse/v1.1/image-to-video", input };
  }
  input.aspect_ratio = normalizeAspect(args.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4"]);
  return { provider: "fal", modelPath: "alibaba/happy-horse/v1.1/text-to-video", input };
};

const buildFalVeoTask = (args) => {
  const images = getImageReferences(args, 2);
  const input = {
    prompt: args.prompt.trim(),
    aspect_ratio: normalizeAspect(args.aspect_ratio, ["16:9", "9:16"]),
    duration: normalizeDuration(args.duration, 4, 8, 8),
    generate_audio: true,
  };
  if (images.length > 1) {
    input.first_frame_url = images[0];
    input.last_frame_url = images[1];
    return { provider: "fal", modelPath: "fal-ai/veo3.1/reference-to-video", input };
  }
  if (images[0]) {
    input.image_url = images[0];
    return { provider: "fal", modelPath: "fal-ai/veo3.1/image-to-video", input };
  }
  return { provider: "fal", modelPath: "fal-ai/veo3.1", input };
};

const buildFalImageTask = (model, args) => {
  const images = getImageReferences(args, 9);
  const aspect = normalizeAspect(args.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4"]);
  const baseInput = { prompt: args.prompt.trim(), aspect_ratio: aspect, num_images: 1 };
  if (model === "gpt_image_2") {
    return images.length
      ? { provider: "fal", modelPath: "openai/gpt-image-2/edit", input: { ...baseInput, image_urls: images } }
      : { provider: "fal", modelPath: "openai/gpt-image-2", input: baseInput };
  }
  if (model === "nano_banana_2") {
    return { provider: "fal", modelPath: "fal-ai/nano-banana-2", input: { ...baseInput, image_urls: images.length ? images : undefined, resolution: "2K" } };
  }
  if (model === "nano_banana_pro") {
    return images.length
      ? { provider: "fal", modelPath: "fal-ai/nano-banana-pro/edit", input: { ...baseInput, image_urls: images, resolution: "2K" } }
      : { provider: "fal", modelPath: "fal-ai/nano-banana-pro", input: { ...baseInput, resolution: "2K" } };
  }
  if (model === "flux_2_pro") return { provider: "fal", modelPath: "fal-ai/flux-2-pro", input: baseInput };
  if (model === "grok_imagine_image") {
    return images.length
      ? { provider: "fal", modelPath: "xai/grok-imagine-image/quality/edit", input: { ...baseInput, image_urls: images } }
      : { provider: "fal", modelPath: "xai/grok-imagine-image", input: baseInput };
  }
  return null;
};

const buildFalMusicTask = (model, args) => {
  const prompt = args.prompt.trim();
  const duration = normalizeDuration(args.duration, 30, 180, 30);

  if (model === "lyria_3") {
    return { provider: "fal", modelPath: "fal-ai/lyria3", input: { prompt } };
  }
  if (model === "audioflow_elevenlabs") {
    return {
      provider: "fal",
      modelPath: "fal-ai/elevenlabs/music",
      input: {
        prompt,
        music_length_ms: duration * 1000,
        force_instrumental: false,
        output_format: "mp3_44100_128",
      },
    };
  }
  if (model === "minimax_music_2_5") {
    return {
      provider: "fal",
      modelPath: "fal-ai/minimax-music/v2.5",
      input: { prompt, lyrics: "", lyrics_optimizer: true, is_instrumental: false },
    };
  }
  if (model === "score_composer_cassetteai") {
    return { provider: "fal", modelPath: "CassetteAI/music-generator", input: { prompt, duration } };
  }
  return null;
};

const buildFalTask = (model, args) => {
  if (model === "seedance_2_0_standard" || model === "seedance_2_0_fast") return buildFalSeedanceTask(model, args);
  if (model === "kling_3_0" || model === "kling_3_0_omni") return buildFalKlingTask(model, args);
  if (model === "gemini_omni_flash") return buildFalGeminiOmniTask(args);
  if (model === "grok_imagine_video_1_5") return buildFalGrokVideoTask(args);
  if (model === "happy_horse_1_1") return buildFalHappyHorseTask(args);
  if (model === "veo_3_1") return buildFalVeoTask(args);
  return buildFalImageTask(model, args) || buildFalMusicTask(model, args);
};

const buildKieSeedanceInput = (args) => {
  const images = getImageReferences(args, 9);
  const videos = cleanHttpsUrls(args.video_references, 3);
  const audio = cleanHttpsUrls(args.audio_references, 3);
  const input = {
    prompt: args.prompt.trim(),
    return_last_frame: false,
    generate_audio: args.generate_audio !== false,
    resolution: normalizeResolution(args.resolution, ["480p", "720p", "1080p", "4k"], "720p"),
    aspect_ratio: normalizeAspect(args.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]),
    duration: normalizeDuration(args.duration, 4, 15, 5),
    web_search: false,
  };
  if (images.length) input.reference_image_urls = images;
  if (videos.length) input.reference_video_urls = videos;
  if (audio.length) input.reference_audio_urls = audio;
  return input;
};

const buildKieTask = (model, args) => {
  if (model.startsWith("seedance_2_0_") && KIE_MARKET_MODELS[model]) {
    return { provider: "kie", model: KIE_MARKET_MODELS[model], input: buildKieSeedanceInput(args) };
  }
  if (model === "kling_3_0_elements") {
    const videos = cleanHttpsUrls(args.video_references, 1);
    if (!videos[0]) return { validationError: "Kling Elements ke liye ek 3–8 second reference video required hai." };
    let prompt = args.prompt.trim();
    if (!/@reference_video\b/.test(prompt)) prompt = `${prompt} @reference_video`;
    return {
      provider: "kie",
      model: KIE_MARKET_MODELS[model],
      input: {
        prompt,
        sound: args.sound !== "off" && args.sound !== false,
        duration: String(normalizeDuration(args.duration, 3, 15, 5)),
        aspect_ratio: normalizeAspect(args.aspect_ratio),
        mode: "pro",
        multi_shots: false,
        kling_elements: [{
          name: "reference_video",
          description: "video reference",
          element_input_urls: videos,
          start_time: 0,
          end_time: Math.min(8000, Math.max(3000, normalizeDuration(args.duration, 3, 8, 5) * 1000)),
        }],
      },
    };
  }
  if (model === "grok_imagine_video_1_5") {
    const images = getImageReferences(args, 1);
    return {
      provider: "kie",
      model: "grok-imagine-video-1-5-preview",
      input: {
        prompt: args.prompt.trim(),
        image_urls: images.length ? images : undefined,
        aspect_ratio: normalizeAspect(args.aspect_ratio, ["16:9", "9:16"]),
        resolution: normalizeResolution(args.resolution, ["480p", "720p", "1080p"], "720p"),
        duration: normalizeDuration(args.duration, 3, 15, 8),
      },
    };
  }
  return null;
};

const safeEqual = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

const normalizeAccessCode = (value) => {
  const code = typeof value === "string" ? value.trim() : "";
  const first = code[0];
  const last = code[code.length - 1];
  return code.length >= 2 && ((first === "\"" && last === "\"") || (first === "'" && last === "'"))
    ? code.slice(1, -1).trim()
    : code;
};

const authorizeStudio = (request, env) => {
  if (env.STUDIO_ALLOW_PUBLIC === "true") return null;
  const configuredCode = normalizeAccessCode(env.STUDIO_ACCESS_CODE);
  const enteredCode = normalizeAccessCode(request.headers.get("X-Studio-Access"));
  if (!configuredCode) {
    return json({
      error: "Paid generation locked",
      message: "Cloudflare mein encrypted STUDIO_ACCESS_CODE add karein. Public credits ko safe rakhne ke liye generation default se locked hai.",
    }, 503);
  }
  if (!safeEqual(enteredCode, configuredCode)) {
    return json({
      error: "Owner access code galat hai.",
      message: "Live Production STUDIO_ACCESS_CODE se match nahi hua. Cloudflare Production secret ko update karke latest deployment retry karein.",
    }, 401);
  }
  return null;
};

const decodeFileName = (value) => {
  let decoded = "reference-file";
  try {
    decoded = decodeURIComponent(value || decoded);
  } catch {
    decoded = "reference-file";
  }
  return decoded.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "reference-file";
};

const uploadToFal = async (env, apiKey, bytes, contentType, originalName) => {
  const initiate = await fetch(`${env.FAL_STORAGE_BASE_URL || FAL_STORAGE_BASE_URL}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
    method: "POST",
    headers: falHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({ file_name: `${crypto.randomUUID()}-${originalName}`, content_type: contentType }),
  });
  const payload = await readJson(initiate);
  if (!initiate.ok) return { errorResponse: upstreamError(payload, "Secure reference upload start nahi hua.") };
  const uploadUrl = payload?.upload_url;
  const fileUrl = payload?.file_url;
  if (typeof uploadUrl !== "string" || typeof fileUrl !== "string" || !/^https:\/\//i.test(fileUrl)) {
    return { errorResponse: upstreamError(payload, "Secure upload URL nahi mila.") };
  }
  const uploaded = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
  if (!uploaded.ok) return { errorResponse: json({ error: "Reference upload failed.", message: `Upload service returned ${uploaded.status}.` }, 502) };
  return { url: fileUrl };
};

const uploadToKie = async (env, apiKey, bytes, contentType, originalName) => {
  const uniqueName = `${crypto.randomUUID()}-${originalName}`;
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), uniqueName);
  form.append("uploadPath", "shazan/reference-uploads");
  form.append("fileName", uniqueName);
  const response = await fetch(`${getKieUploadBase(env)}/api/file-stream-upload`, {
    method: "POST",
    headers: kieHeaders(apiKey),
    body: form,
  });
  const payload = await readJson(response);
  if (!response.ok) return { errorResponse: upstreamError(payload, "Reference upload service unavailable.") };
  const url = payload?.data?.downloadUrl || payload?.data?.fileUrl;
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return { errorResponse: upstreamError(payload, "Secure upload URL nahi mila.") };
  return { url };
};

const handleUpload = async (request, env, falKey, kieKey) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentType = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0];
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES) return json({ error: "Reference file 100 MB se chhoti honi chahiye." }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Reference file empty hai." }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return json({ error: "Reference file 100 MB se chhoti honi chahiye." }, 413);
  const originalName = decodeFileName(request.headers.get("X-File-Name"));
  const result = falKey
    ? await uploadToFal(env, falKey, bytes, contentType, originalName)
    : await uploadToKie(env, kieKey, bytes, contentType, originalName);
  return result.errorResponse || json({ url: result.url });
};

const toBase64Url = (value) => btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromBase64Url = (value) => atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
const encodeFalRequestId = (modelPath, requestId) => `fal.${toBase64Url(modelPath)}.${requestId}`;

const decodeFalRequestId = (value) => {
  const parts = String(value || "").split(".");
  if (parts.length !== 3 || parts[0] !== "fal") return null;
  try {
    const modelPath = fromBase64Url(parts[1]);
    if (!/^[a-zA-Z0-9._/-]{3,180}$/.test(modelPath) || !/^[a-zA-Z0-9_-]{5,120}$/.test(parts[2])) return null;
    return { modelPath, requestId: parts[2] };
  } catch {
    return null;
  }
};

const submitFalTask = async (env, apiKey, task) => {
  const queueBase = (env.FAL_QUEUE_BASE_URL || FAL_QUEUE_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${queueBase}/${task.modelPath}`, {
    method: "POST",
    headers: falHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(task.input),
  });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Generation request accept nahi hui.");
  const requestId = payload?.request_id;
  if (typeof requestId !== "string" || !requestId) return upstreamError(payload, "Render request ID nahi mila.");
  return json({ request_id: encodeFalRequestId(task.modelPath, requestId), status: "queued", provider: "fal" });
};

const submitKieTask = async (env, apiKey, task) => {
  const response = await fetch(`${getKieApiBase(env)}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: kieHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({ model: task.model, input: task.input }),
  });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Generation request accept nahi hui.");
  const requestId = payload?.data?.taskId;
  if (typeof requestId !== "string" || !requestId) return upstreamError(payload, "Render request ID nahi mila.");
  return json({ request_id: requestId, status: "queued", provider: "kie" });
};

const submitSunoTask = async (env, apiKey, args) => {
  const response = await fetch(`${getKieApiBase(env)}/api/v1/generate`, {
    method: "POST",
    headers: kieHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      prompt: args.prompt.trim().slice(0, 500),
      customMode: false,
      instrumental: false,
      model: "V5",
    }),
  });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Suno request accept nahi hui.");
  const requestId = payload?.data?.taskId;
  if (typeof requestId !== "string" || !requestId) return upstreamError(payload, "Suno request ID nahi mila.");
  return json({ request_id: `suno.${requestId}`, status: "queued", provider: "kie" });
};

const handleGenerate = async (request, env, falKey, kieKey) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }
  const model = typeof body?.model === "string" ? body.model : "";
  const args = body?.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? body.arguments : null;
  if (!model || !args) return json({ error: "Model aur arguments required hain." }, 400);
  if (typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 5000) {
    return json({ error: "Prompt 1–5000 characters ka hona chahiye." }, 400);
  }

  if (model === "suno") {
    if (!kieKey) return json({
      error: "Suno is not configured",
      message: "Suno exact music route ke liye Cloudflare mein encrypted KIE_API_KEY add karein.",
    }, 503);
    return submitSunoTask(env, kieKey, args);
  }

  let task = falKey ? buildFalTask(model, args) : null;
  if (!task && kieKey) task = buildKieTask(model, args);
  if (task?.validationError) return json({ error: "Input required", message: task.validationError }, 400);
  if (!task) {
    const fallback = kieKey ? buildKieTask(model, args) : null;
    if (fallback?.validationError) return json({ error: "Input required", message: fallback.validationError }, 400);
    if (fallback) task = fallback;
  }
  if (!task) return json({ error: "Model not connected", message: "Selected model ke liye configured provider key available nahi hai." }, 501);
  if (task.provider === "fal") return submitFalTask(env, falKey, task);
  return submitKieTask(env, kieKey, task);
};

const collectResultUrls = (value, limit = 20) => {
  const urls = [];
  const seen = new Set();
  const visit = (item, path = "result") => {
    if (urls.length >= limit) return;
    if (typeof item === "string" && /^https:\/\//i.test(item) && !/status|cancel|webhook/i.test(path)) {
      if (!seen.has(item)) {
        seen.add(item);
        urls.push(item);
      }
      return;
    }
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) return item.forEach((entry, index) => visit(entry, `${path}.${index}`));
    Object.entries(item).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(value);
  return urls;
};

const mediaTypeForUrl = (url, payload) => {
  const contentType = payload?.video?.content_type || payload?.image?.content_type || payload?.audio?.content_type;
  if (typeof contentType === "string") {
    if (contentType.startsWith("video/")) return "video";
    if (contentType.startsWith("image/")) return "image";
    if (contentType.startsWith("audio/")) return "audio";
  }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(url)) return "audio";
  return "image";
};

const preferredMediaUrl = (urls, preferredType) => urls.find((url) => mediaTypeForUrl(url, {}) === preferredType) || urls[0] || "";

const handleFalStatus = async (request, env, apiKey, encodedRequest) => {
  const queueBase = (env.FAL_QUEUE_BASE_URL || FAL_QUEUE_BASE_URL).replace(/\/$/, "");
  const requestBase = `${queueBase}/${encodedRequest.modelPath}/requests/${encodeURIComponent(encodedRequest.requestId)}`;
  const response = await fetch(`${requestBase}/status`, { headers: falHeaders(apiKey) });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Render status check unavailable.");
  const rawStatus = String(payload?.status || "IN_QUEUE").toUpperCase();
  const status = rawStatus === "COMPLETED" ? "completed" : rawStatus === "IN_PROGRESS" ? "processing" : rawStatus === "FAILED" ? "failed" : "queued";
  if (status !== "completed") {
    return json({
      request_id: encodeFalRequestId(encodedRequest.modelPath, encodedRequest.requestId),
      status,
      progress: Number.isFinite(Number(payload?.progress)) ? Number(payload.progress) : undefined,
      error: status === "failed" ? getErrorMessage(payload, "Generation failed.") : undefined,
    });
  }

  const resultResponse = await fetch(requestBase, { headers: falHeaders(apiKey) });
  const result = await readJson(resultResponse);
  if (!resultResponse.ok) return upstreamError(result, "Completed render result unavailable.");
  const resultUrls = collectResultUrls(result);
  const outputUrl = resultUrls[0] || "";
  return json({
    request_id: encodeFalRequestId(encodedRequest.modelPath, encodedRequest.requestId),
    status: outputUrl ? "completed" : "failed",
    output: outputUrl ? { url: outputUrl, type: mediaTypeForUrl(outputUrl, result) } : undefined,
    result_urls: resultUrls.length ? resultUrls : undefined,
    error: outputUrl ? undefined : "Generation completed but media URL was missing.",
  });
};

const parseKieResult = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const handleKieStatus = async (request, env, apiKey, requestId) => {
  const response = await fetch(`${getKieApiBase(env)}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(requestId)}`, { headers: kieHeaders(apiKey) });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Render status check unavailable.");
  const task = payload?.data;
  if (!task || typeof task !== "object") return upstreamError(payload, "Render status nahi mila.");
  const states = { waiting: "queued", queuing: "queued", generating: "processing", success: "completed", fail: "failed" };
  const status = states[String(task.state || "").toLowerCase()] || "queued";
  const result = parseKieResult(task.resultJson);
  const resultUrls = collectResultUrls(result);
  const outputUrl = resultUrls[0] || "";
  return json({
    request_id: requestId,
    status,
    progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : undefined,
    output: outputUrl ? { url: outputUrl, type: mediaTypeForUrl(outputUrl, result) } : undefined,
    result_urls: resultUrls.length ? resultUrls : undefined,
    usage_units: Number.isFinite(Number(task.creditsConsumed)) ? Number(task.creditsConsumed) : undefined,
    error: status === "failed" ? (task.failMsg || "Generation failed.") : undefined,
  });
};

const handleSunoStatus = async (env, apiKey, requestId) => {
  const response = await fetch(`${getKieApiBase(env)}/api/v1/generate/record-info?taskId=${encodeURIComponent(requestId)}`, { headers: kieHeaders(apiKey) });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Suno status check unavailable.");
  const task = payload?.data;
  if (!task || typeof task !== "object") return upstreamError(payload, "Suno task status nahi mila.");

  const rawStatus = String(task.status || task.response?.status || "PENDING").toUpperCase();
  const failedStates = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"]);
  const status = rawStatus === "SUCCESS" ? "completed" : failedStates.has(rawStatus) ? "failed" : rawStatus === "PENDING" ? "queued" : "processing";
  const resultUrls = collectResultUrls(task.response || task);
  const outputUrl = preferredMediaUrl(resultUrls, "audio");
  return json({
    request_id: `suno.${requestId}`,
    status: status === "completed" && !outputUrl ? "failed" : status,
    output: outputUrl ? { url: outputUrl, type: "audio" } : undefined,
    result_urls: resultUrls.length ? resultUrls : undefined,
    error: status === "failed" ? getErrorMessage(task, "Suno generation failed.") : status === "completed" && !outputUrl ? "Suno completed but audio URL was missing." : undefined,
  });
};

const handleStatus = async (request, env, falKey, kieKey, requestId) => {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!/^[a-zA-Z0-9_.:-]{5,400}$/.test(requestId || "")) return json({ error: "Invalid request ID." }, 400);
  const falRequest = decodeFalRequestId(requestId);
  if (falRequest) {
    if (!falKey) return json({ error: "FAL_KEY is not configured for this request." }, 503);
    return handleFalStatus(request, env, falKey, falRequest);
  }
  if (requestId.startsWith("suno.")) {
    if (!kieKey) return json({ error: "KIE_API_KEY is not configured for this Suno request." }, 503);
    return handleSunoStatus(env, kieKey, requestId.slice(5));
  }
  if (!kieKey) return json({ error: "KIE_API_KEY is not configured for this request." }, 503);
  return handleKieStatus(request, env, kieKey, requestId);
};

const handleStudio = async (request, env, pathname) => {
  const authError = authorizeStudio(request, env);
  if (authError) return authError;
  const falKey = getFalKey(env);
  const kieKey = getKieKey(env);
  if (!falKey && !kieKey) {
    return json({
      error: "Generation service not configured",
      message: "Cloudflare mein encrypted FAL_KEY add karein; KIE_API_KEY optional fallback hai.",
    }, 503);
  }

  const path = pathname.slice("/api/studio/".length).split("/").filter(Boolean);
  try {
    if (path[0] === "upload" && path.length === 1) return await handleUpload(request, env, falKey, kieKey);
    if (path[0] === "generate" && path.length === 1) return await handleGenerate(request, env, falKey, kieKey);
    if (path[0] === "status" && path[1] && path.length === 2) return await handleStatus(request, env, falKey, kieKey, path[1]);
    return json({ error: "Studio route not found." }, 404);
  } catch (error) {
    return json({
      error: "Studio service unavailable.",
      message: error instanceof Error ? error.message : "Generation bridge error.",
    }, 502);
  }
};

const worker = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/studio" || pathname.startsWith("/api/studio/")) return handleStudio(request, env, pathname);
    if (!env.ASSETS?.fetch) return json({ error: "Static assets binding missing." }, 500);
    return env.ASSETS.fetch(request);
  },
};

export default worker;
