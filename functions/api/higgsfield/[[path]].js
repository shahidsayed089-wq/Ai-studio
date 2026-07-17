const PLATFORM_BASE_URL = "https://platform.higgsfield.ai";

const MODEL_ENV_KEYS = {
  seedance_2_0_standard: "HIGGSFIELD_SEEDANCE_2_STANDARD_ENDPOINT",
  seedance_2_0_fast: "HIGGSFIELD_SEEDANCE_2_FAST_ENDPOINT",
  seedance_2_0_mini: "HIGGSFIELD_SEEDANCE_2_MINI_ENDPOINT",
  kling_3_0_omni: "HIGGSFIELD_KLING_3_OMNI_ENDPOINT",
  kling_3_0: "HIGGSFIELD_KLING_3_ENDPOINT",
  happy_horse_1_1: "HIGGSFIELD_HAPPY_HORSE_ENDPOINT",
  sora_2: "HIGGSFIELD_SORA_2_ENDPOINT",
  veo_3_1: "HIGGSFIELD_VEO_3_1_ENDPOINT",
  runway_gen_4_5: "HIGGSFIELD_RUNWAY_GEN_4_5_ENDPOINT",
  luma_ray_3_2: "HIGGSFIELD_LUMA_RAY_3_2_ENDPOINT",
  luma_ray_3_14: "HIGGSFIELD_LUMA_RAY_3_14_ENDPOINT",
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

const getPath = (context) => {
  const value = context.params?.path;
  return Array.isArray(value) ? value : typeof value === "string" ? value.split("/").filter(Boolean) : [];
};

const safeEqual = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

const authorizeStudio = (request, env) => {
  if (env.HIGGSFIELD_ALLOW_PUBLIC === "true") return null;
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

const getCredentials = (env) => {
  if (env.HF_CREDENTIALS) return env.HF_CREDENTIALS;
  if (env.HF_KEY) return env.HF_KEY;
  if (env.HF_API_KEY && env.HF_API_SECRET) return `${env.HF_API_KEY}:${env.HF_API_SECRET}`;
  if (env.HIGGSFIELD_API_ID && env.HIGGSFIELD_API_KEY) return `${env.HIGGSFIELD_API_ID}:${env.HIGGSFIELD_API_KEY}`;
  if (env.HIGGSFIELD_API_KEY && env.HIGGSFIELD_API_SECRET) return `${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_API_SECRET}`;
  if (env.HIGGSFIELD_API_KEY && env.HIGGSFIELD_SECRET) return `${env.HIGGSFIELD_API_KEY}:${env.HIGGSFIELD_SECRET}`;
  if (typeof env.HIGGSFIELD_API_KEY === "string" && env.HIGGSFIELD_API_KEY.includes(":")) return env.HIGGSFIELD_API_KEY;
  return "";
};

const getPlatform = (env) => (env.HIGGSFIELD_API_BASE_URL || PLATFORM_BASE_URL).replace(/\/$/, "");

const higgsfieldHeaders = (credentials, extra = {}) => ({
  Accept: "application/json",
  Authorization: `Key ${credentials}`,
  ...extra,
});

const readUpstream = async (response) => {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text || `Higgsfield returned HTTP ${response.status}` };
  }
  if (!response.ok) {
    return json({
      error: payload.error || payload.detail || payload.message || "Higgsfield request failed",
      status: response.status,
    }, response.status >= 400 && response.status < 600 ? response.status : 502);
  }
  return json(payload, response.status);
};

const getEndpoint = (model, env) => {
  let configured = {};
  if (env.HIGGSFIELD_MODEL_ENDPOINTS) {
    try {
      configured = JSON.parse(env.HIGGSFIELD_MODEL_ENDPOINTS);
    } catch {
      throw new Error("HIGGSFIELD_MODEL_ENDPOINTS valid JSON nahi hai.");
    }
  }
  const envKey = MODEL_ENV_KEYS[model];
  const endpoint = configured[model] || (envKey ? env[envKey] : "");
  if (!endpoint) {
    throw new Error(`${model} ka public REST model_id configured nahi hai. Cloudflare mein ${envKey || "HIGGSFIELD_MODEL_ENDPOINTS"} add karein.`);
  }
  const clean = String(endpoint).replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean || clean.includes("..") || clean.includes("://") || !/^[a-zA-Z0-9._/-]+$/.test(clean)) {
    throw new Error("Configured Higgsfield model_id invalid hai.");
  }
  return clean;
};

const handleUpload = async (context, credentials) => {
  if (context.request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentType = (context.request.headers.get("Content-Type") || "application/octet-stream").split(";")[0];
  const contentLength = Number(context.request.headers.get("Content-Length") || 0);
  if (contentLength > 100 * 1024 * 1024) return json({ error: "Reference file 100 MB se chhoti honi chahiye." }, 413);

  const platform = getPlatform(context.env);
  const signedResponse = await fetch(`${platform}/files/generate-upload-url`, {
    method: "POST",
    headers: higgsfieldHeaders(credentials, { "Content-Type": "application/json" }),
    body: JSON.stringify({ content_type: contentType }),
  });
  if (!signedResponse.ok) return readUpstream(signedResponse);

  const signed = await signedResponse.json();
  if (!signed.upload_url || !signed.public_url) return json({ error: "Higgsfield ne signed upload URL return nahi ki." }, 502);
  const bytes = await context.request.arrayBuffer();
  if (bytes.byteLength > 100 * 1024 * 1024) return json({ error: "Reference file 100 MB se chhoti honi chahiye." }, 413);

  const uploadResponse = await fetch(signed.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  if (!uploadResponse.ok) return json({ error: `Reference upload failed (${uploadResponse.status}).` }, 502);
  return json({ url: signed.public_url });
};

const handleGenerate = async (context, credentials) => {
  if (context.request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }
  const model = typeof body.model === "string" ? body.model : "";
  const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? body.arguments : null;
  if (!model || !args) return json({ error: "Model aur arguments required hain." }, 400);
  if (typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 5000) {
    return json({ error: "Prompt 1–5000 characters ka hona chahiye." }, 400);
  }

  let endpoint;
  try {
    endpoint = getEndpoint(model, context.env);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Model endpoint missing." }, 503);
  }
  const response = await fetch(`${getPlatform(context.env)}/${endpoint}`, {
    method: "POST",
    headers: higgsfieldHeaders(credentials, { "Content-Type": "application/json" }),
    body: JSON.stringify(args),
  });
  return readUpstream(response);
};

const handleStatus = async (context, credentials, requestId) => {
  if (context.request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(requestId || "")) return json({ error: "Invalid request ID." }, 400);
  const response = await fetch(`${getPlatform(context.env)}/requests/${encodeURIComponent(requestId)}/status`, {
    headers: higgsfieldHeaders(credentials),
  });
  return readUpstream(response);
};

export const onRequest = async (context) => {
  const accessError = authorizeStudio(context.request, context.env);
  if (accessError) return accessError;

  const credentials = getCredentials(context.env);
  if (!credentials || !credentials.includes(":")) {
    return json({
      error: "Higgsfield credentials missing",
      message: "HF_API_KEY + HF_API_SECRET, ya HIGGSFIELD_API_ID + HIGGSFIELD_API_KEY encrypted secrets add karein.",
    }, 503);
  }

  const path = getPath(context);
  try {
    if (path[0] === "upload" && path.length === 1) return await handleUpload(context, credentials);
    if (path[0] === "generate" && path.length === 1) return await handleGenerate(context, credentials);
    if (path[0] === "status" && path[1] && path.length === 2) return await handleStatus(context, credentials, path[1]);
    return json({ error: "Higgsfield route not found." }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Higgsfield bridge error." }, 502);
  }
};
