const KIE_API_BASE_URL = "https://api.kie.ai";
const KIE_UPLOAD_BASE_URL = "https://kieai.redpandaai.co";
const FAL_QUEUE_BASE_URL = "https://queue.fal.run";
const FAL_STORAGE_BASE_URL = "https://rest.fal.ai";
const OPENAI_API_BASE_URL = "https://api.openai.com";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AUTH_COOKIE = "__Host-shazan_session";
const AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60;
const AUTH_PBKDF2_ITERATIONS = 310000;

const AUTH_SCHEMA_STATEMENTS = [`CREATE TABLE IF NOT EXISTS shazan_auth_users_v1 (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);`, `CREATE TABLE IF NOT EXISTS shazan_auth_sessions_v1 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES shazan_auth_users_v1(id) ON DELETE CASCADE
);`, `CREATE TABLE IF NOT EXISTS shazan_auth_attempts_v1 (
  scope_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);`];

const KIE_MARKET_MODELS = {
  seedance_2_0_standard: "bytedance/seedance-2",
  seedance_2_0_fast: "bytedance/seedance-2-fast",
  seedance_2_0_mini: "bytedance/seedance-2-mini",
  kling_3_0_elements: "kling-3.0/video",
  runway_gen_4_5: "runway_gen_4_5",
};

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  },
});

const getFalKey = (env) => typeof env.FAL_KEY === "string" ? env.FAL_KEY.trim() : "";
const getKieKey = (env) => typeof env.KIE_API_KEY === "string" ? env.KIE_API_KEY.trim() : "";
const getOpenAIKey = (env) => typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : "";
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
  if (model === "score_composer_cassetteai") {
    return { provider: "fal", modelPath: "CassetteAI/music-generator", input: { prompt, duration } };
  }
  return null;
};

const buildFalVoiceTask = (model, args) => {
  const text = args.prompt.trim();
  const voice = typeof args.voice === "string" && /^[a-zA-Z0-9 _-]{2,80}$/.test(args.voice) ? args.voice : "Rachel";
  if (model === "elevenlabs_voice") {
    return {
      provider: "fal",
      modelPath: "fal-ai/elevenlabs/tts/eleven-v3",
      input: { text, voice, stability: 0.5, apply_text_normalization: "auto" },
    };
  }
  if (model === "multilingual_pro") {
    return {
      provider: "fal",
      modelPath: "fal-ai/elevenlabs/tts/multilingual-v2",
      input: { text, voice, stability: 0.5, similarity_boost: 0.75, speed: 1, apply_text_normalization: "auto" },
    };
  }
  if (model === "voice_forge") {
    return {
      provider: "fal",
      modelPath: "fal-ai/elevenlabs/text-to-voice/design/eleven-v3",
      input: { prompt: text, auto_generate_text: true, loudness: 0.5, guidance_scale: 5, output_format: "mp3_44100_128" },
    };
  }
  return null;
};

const buildFalAvatarTask = (model, args) => {
  const image = getImageReferences(args, 1)[0];
  const audio = cleanHttpsUrls(args.audio_references, 1)[0];
  const video = cleanHttpsUrls(args.video_references, 1)[0];

  if (model === "heygen_avatar_iv") {
    if (!image) return { validationError: "HeyGen Avatar IV ke liye clear-face photo required hai." };
    return {
      provider: "fal",
      modelPath: "fal-ai/heygen/avatar4/image-to-video",
      input: {
        image_url: image,
        prompt: args.prompt.trim(),
        audio_url: audio || undefined,
        talking_style: "expressive",
        resolution: normalizeResolution(args.resolution, ["720p", "1080p"], "720p"),
      },
    };
  }

  if (model === "avatar_one") {
    if (!image || !audio) return { validationError: "Avatar One ke liye ek character image aur ek voice audio required hai." };
    return {
      provider: "fal",
      modelPath: "fal-ai/kling-video/ai-avatar/v2/standard",
      input: { image_url: image, audio_url: audio, prompt: args.prompt.trim() || "." },
    };
  }

  if (model === "digital_twin") {
    if (!image || !audio) return { validationError: "Digital Twin ke liye ek person image aur 30 second se chhota voice audio required hai." };
    return {
      provider: "fal",
      modelPath: "fal-ai/bytedance/omnihuman",
      input: { image_url: image, audio_url: audio },
    };
  }

  if (model === "performance_capture") {
    if (!image || !video) return { validationError: "Performance Capture ke liye character image aur driving-performance video required hai." };
    return {
      provider: "fal",
      modelPath: "fal-ai/wan-motion",
      input: {
        image_url: image,
        video_url: video,
        prompt: args.prompt.trim(),
        acceleration: "regular",
        adapt_motion: true,
        enable_safety_checker: true,
      },
    };
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
  return buildFalImageTask(model, args) || buildFalMusicTask(model, args) || buildFalVoiceTask(model, args) || buildFalAvatarTask(model, args);
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

const authSchemaReady = new WeakSet();
const textEncoder = new TextEncoder();

const nowSeconds = () => Math.floor(Date.now() / 1000);

const bytesToBase64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const randomToken = (size = 32) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

const sha256 = async (value) => bytesToBase64Url(new Uint8Array(
  await crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
));

const hashPassword = async (password, salt, pepper) => {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(`${password}\u0000${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: textEncoder.encode(salt),
    iterations: AUTH_PBKDF2_ITERATIONS,
  }, key, 256);
  return bytesToBase64Url(new Uint8Array(derived));
};

const ensureAuthSchema = async (db) => {
  if (authSchemaReady.has(db)) return;
  for (const statement of AUTH_SCHEMA_STATEMENTS) await db.prepare(statement).run();
  authSchemaReady.add(db);
};

const getAuthRuntime = async (env) => {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return { error: json({
      error: "Account database setup pending",
      message: "Cloudflare D1 database ko DB binding naam se connect karke deployment retry karein.",
    }, 503) };
  }
  const pepper = typeof env.AUTH_PEPPER === "string" ? env.AUTH_PEPPER.trim() : "";
  if (pepper.length < 32) {
    return { error: json({
      error: "Account security secret missing",
      message: "Cloudflare mein minimum 32-character encrypted AUTH_PEPPER secret add karein.",
    }, 503) };
  }
  await ensureAuthSchema(env.DB);
  return { db: env.DB, pepper };
};

const parseCookies = (request) => {
  const cookies = new Map();
  for (const item of (request.headers.get("Cookie") || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
};

const sessionCookie = (token) => `${AUTH_COOKIE}=${token}; Path=/; Max-Age=${AUTH_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
const expiredSessionCookie = () => `${AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

const sameOriginMutationError = (request) => {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite === "cross-site") return json({ error: "Cross-site request blocked." }, 403);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-site request blocked." }, 403);
  return null;
};

const readAuthBody = async (request) => {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) return { error: json({ error: "JSON request required." }, 415) };
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 32 * 1024) return { error: json({ error: "Request body too large." }, 413) };
  const raw = await request.text();
  if (raw.length > 32 * 1024) return { error: json({ error: "Request body too large." }, 413) };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return { value };
  } catch {
    return { error: json({ error: "Invalid JSON request." }, 400) };
  }
};

const normalizeEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (email) => email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email);
const normalizeDisplayName = (value) => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
const validDisplayName = (name) => name.length >= 2 && name.length <= 40 && /^[\p{L}\p{M}\p{N} .'’-]+$/u.test(name);

const passwordValidationMessage = (password) => {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) return "Password 12–128 characters ka hona chahiye.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Password mein uppercase, lowercase, number aur symbol required hain.";
  }
  return "";
};

const authClientIp = (request) => request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";

const rateLimitKey = async (scope, request, pepper, identity = "") => sha256(`${scope}\u0000${authClientIp(request)}\u0000${identity}\u0000${pepper}`);

const getRateLimit = async (db, scopeKey, limit, windowSeconds) => {
  const current = nowSeconds();
  const row = await db.prepare("SELECT attempt_count, window_started_at, blocked_until FROM shazan_auth_attempts_v1 WHERE scope_key = ? LIMIT 1").bind(scopeKey).first();
  if (!row) return null;
  if (Number(row.blocked_until) > current) return Math.max(1, Number(row.blocked_until) - current);
  if (current - Number(row.window_started_at) >= windowSeconds) {
    await db.prepare("DELETE FROM shazan_auth_attempts_v1 WHERE scope_key = ?").bind(scopeKey).run();
    return null;
  }
  if (Number(row.attempt_count) >= limit) return Math.max(1, windowSeconds - (current - Number(row.window_started_at)));
  return null;
};

const recordRateEvent = async (db, scopeKey, limit, windowSeconds) => {
  const current = nowSeconds();
  const row = await db.prepare("SELECT attempt_count, window_started_at FROM shazan_auth_attempts_v1 WHERE scope_key = ? LIMIT 1").bind(scopeKey).first();
  const expired = !row || current - Number(row.window_started_at) >= windowSeconds;
  const count = expired ? 1 : Number(row.attempt_count) + 1;
  const windowStarted = expired ? current : Number(row.window_started_at);
  const blockedUntil = count >= limit ? windowStarted + windowSeconds : 0;
  await db.prepare(`INSERT INTO shazan_auth_attempts_v1 (scope_key, attempt_count, window_started_at, blocked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(scope_key) DO UPDATE SET attempt_count = excluded.attempt_count, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until`)
    .bind(scopeKey, count, windowStarted, blockedUntil).run();
};

const clearRateLimit = (db, scopeKey) => db.prepare("DELETE FROM shazan_auth_attempts_v1 WHERE scope_key = ?").bind(scopeKey).run();

const publicAuthUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.display_name,
  role: row.role,
  credits: Number(row.credits) || 0,
});

const createSession = async (db, userId) => {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const current = nowSeconds();
  await db.prepare(`INSERT INTO shazan_auth_sessions_v1 (id, user_id, token_hash, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), userId, tokenHash, current + AUTH_SESSION_SECONDS, current, current).run();
  return token;
};

const getSession = async (request, db) => {
  const token = parseCookies(request).get(AUTH_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
      u.id, u.email, u.display_name, u.role, u.status, u.credits
    FROM shazan_auth_sessions_v1 s JOIN shazan_auth_users_v1 u ON u.id = s.user_id
    WHERE s.token_hash = ? LIMIT 1`).bind(tokenHash).first();
  if (!row) return null;
  const current = nowSeconds();
  if (Number(row.expires_at) <= current || row.status !== "active") {
    await db.prepare("DELETE FROM shazan_auth_sessions_v1 WHERE id = ?").bind(row.session_id).run();
    return null;
  }
  if (current - Number(row.last_seen_at) > 60 * 60) {
    await db.prepare("UPDATE shazan_auth_sessions_v1 SET last_seen_at = ? WHERE id = ?").bind(current, row.session_id).run();
  }
  return { row, tokenHash };
};

const handleAuthRegister = async (request, db, pepper) => {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const parsed = await readAuthBody(request);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.value.email);
  const displayName = normalizeDisplayName(parsed.value.name);
  const password = parsed.value.password;
  if (!validDisplayName(displayName)) return json({ error: "Name 2–40 letters ka hona chahiye." }, 400);
  if (!validEmail(email)) return json({ error: "Valid email address enter karein." }, 400);
  const passwordError = passwordValidationMessage(password);
  if (passwordError) return json({ error: passwordError }, 400);

  const scopeKey = await rateLimitKey("register", request, pepper);
  const retryAfter = await getRateLimit(db, scopeKey, 5, 60 * 60);
  if (retryAfter) return json({ error: "Too many registration attempts. Baad mein retry karein." }, 429, { "Retry-After": String(retryAfter) });
  await recordRateEvent(db, scopeKey, 5, 60 * 60);

  const existing = await db.prepare("SELECT id FROM shazan_auth_users_v1 WHERE email = ? LIMIT 1").bind(email).first();
  if (existing) return json({ error: "Is email ka account already hai. Sign in karein." }, 409);

  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt, pepper);
  const current = nowSeconds();
  const userId = crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO shazan_auth_users_v1 (id, email, display_name, password_hash, password_salt, role, status, credits, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'user', 'active', 0, 0, ?, ?)`)
      .bind(userId, email, displayName, passwordHash, salt, current, current).run();
  } catch (error) {
    if (/unique|constraint/i.test(String(error?.message || error))) return json({ error: "Is email ka account already hai. Sign in karein." }, 409);
    throw error;
  }
  const token = await createSession(db, userId);
  return json({ authenticated: true, user: { id: userId, email, name: displayName, role: "user", credits: 0 } }, 201, {
    "Set-Cookie": sessionCookie(token),
  });
};

const handleAuthLogin = async (request, db, pepper) => {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const parsed = await readAuthBody(request);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.value.email);
  const password = typeof parsed.value.password === "string" ? parsed.value.password : "";
  if (!validEmail(email) || !password || password.length > 128) return json({ error: "Email ya password galat hai." }, 401);

  const scopeKey = await rateLimitKey("login", request, pepper, email);
  const retryAfter = await getRateLimit(db, scopeKey, 5, 15 * 60);
  if (retryAfter) return json({ error: "Too many login attempts. 15 minute baad retry karein." }, 429, { "Retry-After": String(retryAfter) });

  const user = await db.prepare(`SELECT id, email, display_name, password_hash, password_salt, role, status, credits
    FROM shazan_auth_users_v1 WHERE email = ? LIMIT 1`).bind(email).first();
  const candidateHash = user
    ? await hashPassword(password, user.password_salt, pepper)
    : await hashPassword(password, "not-a-real-user-salt", pepper);
  if (!user || !safeEqual(candidateHash, user.password_hash) || user.status !== "active") {
    await recordRateEvent(db, scopeKey, 5, 15 * 60);
    return json({ error: "Email ya password galat hai." }, 401);
  }

  await clearRateLimit(db, scopeKey);
  const current = nowSeconds();
  await db.prepare("UPDATE shazan_auth_users_v1 SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(current, current, user.id).run();
  const token = await createSession(db, user.id);
  return json({ authenticated: true, user: publicAuthUser(user) }, 200, { "Set-Cookie": sessionCookie(token) });
};

const handleAuthSession = async (request, db) => {
  const session = await getSession(request, db);
  if (!session) return json({ authenticated: false, user: null });
  return json({ authenticated: true, user: publicAuthUser(session.row) });
};

const handleAuthLogout = async (request, db) => {
  const originError = sameOriginMutationError(request);
  if (originError) return originError;
  const token = parseCookies(request).get(AUTH_COOKIE);
  if (token) await db.prepare("DELETE FROM shazan_auth_sessions_v1 WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ authenticated: false, user: null }, 200, { "Set-Cookie": expiredSessionCookie() });
};

const handleAuth = async (request, env, pathname) => {
  try {
    const runtime = await getAuthRuntime(env);
    if (runtime.error) return runtime.error;
    if (pathname === "/api/auth/session" && request.method === "GET") return handleAuthSession(request, runtime.db);
    if (pathname === "/api/auth/register" && request.method === "POST") return handleAuthRegister(request, runtime.db, runtime.pepper);
    if (pathname === "/api/auth/login" && request.method === "POST") return handleAuthLogin(request, runtime.db, runtime.pepper);
    if (pathname === "/api/auth/logout" && request.method === "POST") return handleAuthLogout(request, runtime.db);
    return json({ error: "Auth route not found." }, 404);
  } catch {
    return json({
      error: "Account service unavailable.",
      message: "Temporary authentication service error. Thodi der baad retry karein.",
    }, 500);
  }
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

const submitOpenAITts = async (env, openAIKey, falKey, args) => {
  const allowedVoices = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"]);
  const voice = allowedVoices.has(args.voice) ? args.voice : "marin";
  const response = await fetch(`${(env.OPENAI_API_BASE_URL || OPENAI_API_BASE_URL).replace(/\/$/, "")}/v1/audio/speech`, {
    method: "POST",
    headers: {
      Accept: "audio/mpeg",
      Authorization: `Bearer ${openAIKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      input: args.prompt.trim().slice(0, 4096),
      voice,
      instructions: "Natural cinematic delivery. Preserve the speaker's language, pronunciation and emotional intent.",
      response_format: "mp3",
    }),
  });
  if (!response.ok) return upstreamError(await readJson(response), "GPT voice generation start nahi hui.");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "GPT voice audio empty tha." }, 502);
  const uploaded = await uploadToFal(env, falKey, bytes, "audio/mpeg", "gpt-voice.mp3");
  if (uploaded.errorResponse) return uploaded.errorResponse;
  return json({
    request_id: `openai.${crypto.randomUUID()}`,
    status: "completed",
    provider: "openai",
    output: { url: uploaded.url, type: "audio" },
  });
};

const handleGenerate = async (request, env, falKey, kieKey, openAIKey) => {
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
  if (model === "gpt_voice") {
    if (!openAIKey || !falKey) return json({
      error: "GPT Voice is not configured",
      message: "Cloudflare Production mein encrypted OPENAI_API_KEY aur FAL_KEY dono required hain.",
    }, 503);
    return submitOpenAITts(env, openAIKey, falKey, args);
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
  const openAIKey = getOpenAIKey(env);
  if (!falKey && !kieKey && !openAIKey) {
    return json({
      error: "Generation service not configured",
      message: "Cloudflare mein encrypted FAL_KEY add karein; KIE_API_KEY optional fallback hai.",
    }, 503);
  }

  const path = pathname.slice("/api/studio/".length).split("/").filter(Boolean);
  try {
    if (path[0] === "upload" && path.length === 1) return await handleUpload(request, env, falKey, kieKey);
    if (path[0] === "generate" && path.length === 1) return await handleGenerate(request, env, falKey, kieKey, openAIKey);
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
    if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return handleAuth(request, env, pathname);
    if (pathname === "/api/studio" || pathname.startsWith("/api/studio/")) return handleStudio(request, env, pathname);
    if (!env.ASSETS?.fetch) return json({ error: "Static assets binding missing." }, 500);
    return env.ASSETS.fetch(request);
  },
};

export default worker;
