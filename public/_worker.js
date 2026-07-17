const API_BASE_URL = "https://api.kie.ai";
const UPLOAD_BASE_URL = "https://kieai.redpandaai.co";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const MARKET_MODELS = {
  seedance_2_0_standard: "bytedance/seedance-2",
  seedance_2_0_fast: "bytedance/seedance-2-fast",
  seedance_2_0_mini: "bytedance/seedance-2-mini",
  kling_3_0_elements: "kling-3.0/video",
  kling_3_0_omni: "kling-3.0/video",
  kling_3_0: "kling-3.0/video",
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

const safeEqual = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

const authorizeStudio = (request, env) => {
  if (env.STUDIO_ALLOW_PUBLIC === "true") return null;
  if (!env.STUDIO_ACCESS_CODE) {
    return json({
      error: "Paid generation locked",
      message: "Cloudflare mein encrypted STUDIO_ACCESS_CODE add karein. Public credits ko safe rakhne ke liye generation default se locked hai.",
    }, 503);
  }
  if (!safeEqual(request.headers.get("X-Studio-Access") || "", env.STUDIO_ACCESS_CODE)) {
    return json({ error: "Owner access code galat hai." }, 401);
  }
  return null;
};

const getApiKey = (env) => typeof env.KIE_API_KEY === "string" ? env.KIE_API_KEY.trim() : "";
const getApiBase = (env) => (env.KIE_API_BASE_URL || API_BASE_URL).replace(/\/$/, "");
const getUploadBase = (env) => (env.KIE_UPLOAD_BASE_URL || UPLOAD_BASE_URL).replace(/\/$/, "");

const apiHeaders = (apiKey, extra = {}) => ({
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
    return { msg: "Render service returned an unreadable response." };
  }
};

const upstreamError = (payload, fallback, status = 502) => json({
  error: fallback,
  message: typeof payload?.msg === "string" && payload.msg.length < 300 ? payload.msg : fallback,
  service_code: typeof payload?.code === "number" ? payload.code : undefined,
}, status);

const cleanHttpsUrls = (value, limit) => Array.isArray(value)
  ? value.filter((item) => typeof item === "string" && /^https:\/\//i.test(item)).slice(0, limit)
  : [];

const normalizeResolution = (value, allowed, fallback) => {
  const candidate = String(value || "").toUpperCase() === "4K" ? "4K" : String(value || "").toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
};

const normalizeAspect = (value, allowed = ["16:9", "9:16", "1:1"]) => allowed.includes(value) ? value : "16:9";

const normalizeDuration = (value, minimum = 3, maximum = 15) => {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return Math.max(minimum, 5);
  return Math.min(maximum, Math.max(minimum, Math.round(duration)));
};

const buildSeedanceInput = (args) => {
  const images = cleanHttpsUrls(args.image_references, 9);
  const videos = cleanHttpsUrls(args.video_references, 3);
  const audio = cleanHttpsUrls(args.audio_references, 3);
  const hasMultimodalReferences = images.length + videos.length + audio.length > 0;
  const input = {
    prompt: args.prompt.trim(),
    return_last_frame: false,
    generate_audio: args.generate_audio !== false,
    resolution: normalizeResolution(args.resolution, ["480p", "720p", "1080p", "4K"], "720p"),
    aspect_ratio: normalizeAspect(args.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]),
    duration: normalizeDuration(args.duration, 4, 15),
    web_search: false,
  };

  if (hasMultimodalReferences) {
    if (images.length) input.reference_image_urls = images;
    if (videos.length) input.reference_video_urls = videos;
    if (audio.length) input.reference_audio_urls = audio;
  } else {
    const firstFrame = typeof args.start_image === "string" ? args.start_image : "";
    const lastFrame = typeof args.end_image === "string" ? args.end_image : "";
    if (/^https:\/\//i.test(firstFrame)) input.first_frame_url = firstFrame;
    if (/^https:\/\//i.test(lastFrame)) input.last_frame_url = lastFrame;
  }
  return input;
};

const buildKlingInput = (args, useElements) => {
  const duration = normalizeDuration(args.duration, 3, 15);
  const resolution = normalizeResolution(args.resolution, ["720p", "1080p", "4K"], "720p");
  const imageUrls = [args.start_image, args.end_image]
    .filter((item) => typeof item === "string" && /^https:\/\//i.test(item))
    .slice(0, 2);
  const videoReferences = cleanHttpsUrls(args.video_references, 1);
  let prompt = args.prompt.trim();
  const input = {
    prompt,
    sound: args.sound !== false && args.sound !== "off",
    duration: String(duration),
    aspect_ratio: normalizeAspect(args.aspect_ratio),
    mode: resolution === "4K" ? "4K" : resolution === "1080p" ? "pro" : "std",
    multi_shots: false,
  };
  if (imageUrls.length) input.image_urls = imageUrls;

  if (useElements && videoReferences.length) {
    if (!/@reference_video\b/.test(prompt)) prompt = `${prompt} @reference_video`;
    input.prompt = prompt;
    input.kling_elements = [{
      name: "reference_video",
      description: "video reference",
      element_input_urls: videoReferences,
      start_time: 0,
      end_time: Math.min(8000, Math.max(3000, duration * 1000)),
    }];
  }
  return input;
};

const buildHappyHorseTask = (args) => {
  const references = cleanHttpsUrls(args.image_references, 4);
  const firstImage = typeof args.start_image === "string" && /^https:\/\//i.test(args.start_image)
    ? args.start_image
    : references[0];
  const input = {
    prompt: args.prompt.trim(),
    resolution: normalizeResolution(args.resolution, ["720p", "1080p"], "1080p"),
    duration: normalizeDuration(args.duration, 5, 15),
  };
  if (references.length > 1) {
    input.reference_image = references;
    input.aspect_ratio = normalizeAspect(args.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4"]);
    return { model: "happyhorse-1-1/reference-to-video", input };
  }
  if (firstImage) {
    input.image_urls = [firstImage];
    return { model: "happyhorse-1-1/image-to-video", input };
  }
  input.aspect_ratio = normalizeAspect(args.aspect_ratio, ["16:9", "9:16", "1:1", "4:3", "3:4"]);
  return { model: "happyhorse-1-1/text-to-video", input };
};

const buildMarketTask = (model, args) => {
  if (model.startsWith("seedance_2_0_")) {
    const marketModel = MARKET_MODELS[model];
    return marketModel ? { model: marketModel, input: buildSeedanceInput(args) } : null;
  }
  if (model === "kling_3_0_elements" || model === "kling_3_0_omni") {
    return { model: MARKET_MODELS[model], input: buildKlingInput(args, true) };
  }
  if (model === "kling_3_0") {
    return { model: MARKET_MODELS[model], input: buildKlingInput(args, false) };
  }
  if (model === "happy_horse_1_1") return buildHappyHorseTask(args);
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

const handleUpload = async (request, env, apiKey) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentType = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0];
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES) return json({ error: "Reference file 100 MB se chhoti honi chahiye." }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Reference file empty hai." }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return json({ error: "Reference file 100 MB se chhoti honi chahiye." }, 413);

  const originalName = decodeFileName(request.headers.get("X-File-Name"));
  const uniqueName = `${crypto.randomUUID()}-${originalName}`;
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), uniqueName);
  form.append("uploadPath", "shazan/reference-uploads");
  form.append("fileName", uniqueName);

  const response = await fetch(`${getUploadBase(env)}/api/file-stream-upload`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: form,
  });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Reference upload service unavailable.", 502);
  const url = payload?.data?.downloadUrl || payload?.data?.fileUrl;
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) {
    return upstreamError(payload, "Secure upload URL nahi mila.");
  }
  return json({ url });
};

const handleGenerate = async (request, env, apiKey) => {
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

  const task = buildMarketTask(model, args);
  if (!task) {
    return json({
      error: "Model not connected",
      message: "Selected model abhi SHAZAN generation bridge par connected nahi hai.",
    }, 501);
  }

  const response = await fetch(`${getApiBase(env)}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: apiHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(task),
  });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Generation request accept nahi hui.", 502);
  const requestId = payload?.data?.taskId;
  if (typeof requestId !== "string" || !requestId) {
    return upstreamError(payload, "Render request ID nahi mila.");
  }
  return json({ request_id: requestId, status: "queued" });
};

const parseResult = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const handleStatus = async (request, env, apiKey, requestId) => {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!/^[a-zA-Z0-9_.:-]{5,200}$/.test(requestId || "")) return json({ error: "Invalid request ID." }, 400);
  const response = await fetch(`${getApiBase(env)}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(requestId)}`, {
    headers: apiHeaders(apiKey),
  });
  const payload = await readJson(response);
  if (!response.ok) return upstreamError(payload, "Render status check unavailable.", 502);
  const task = payload?.data;
  if (!task || typeof task !== "object") return upstreamError(payload, "Render status nahi mila.");

  const states = {
    waiting: "queued",
    queuing: "queued",
    generating: "processing",
    success: "completed",
    fail: "failed",
  };
  const status = states[String(task.state || "").toLowerCase()] || "queued";
  const result = parseResult(task.resultJson);
  const resultUrls = cleanHttpsUrls(result.resultUrls, 20);
  const videoUrl = resultUrls[0] || "";
  return json({
    request_id: requestId,
    status,
    progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : undefined,
    video_url: videoUrl || undefined,
    output: videoUrl ? { url: videoUrl } : undefined,
    result_urls: resultUrls.length ? resultUrls : undefined,
    usage_units: Number.isFinite(Number(task.creditsConsumed)) ? Number(task.creditsConsumed) : undefined,
    error: status === "failed" ? (task.failMsg || "Generation failed.") : undefined,
  });
};

const handleStudio = async (request, env, pathname) => {
  const accessError = authorizeStudio(request, env);
  if (accessError) return accessError;
  const apiKey = getApiKey(env);
  if (!apiKey) {
    return json({
      error: "Generation service not configured",
      message: "Cloudflare mein encrypted KIE_API_KEY secret add karein.",
    }, 503);
  }

  const path = pathname.slice("/api/studio/".length).split("/").filter(Boolean);
  try {
    if (path[0] === "upload" && path.length === 1) return await handleUpload(request, env, apiKey);
    if (path[0] === "generate" && path.length === 1) return await handleGenerate(request, env, apiKey);
    if (path[0] === "status" && path[1] && path.length === 2) return await handleStatus(request, env, apiKey, path[1]);
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
    if (pathname === "/api/studio" || pathname.startsWith("/api/studio/")) {
      return handleStudio(request, env, pathname);
    }
    if (!env.ASSETS?.fetch) return json({ error: "Static assets binding missing." }, 500);
    return env.ASSETS.fetch(request);
  },
};

export default worker;
