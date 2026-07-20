import { request as playwrightRequest, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

export const BASE_URL = "http://127.0.0.1:4173";
export const PASSWORD = "LaunchReady!2026";
let serial = 20;

export const workflow = (prompt = "A cinematic city") => ({
  nodes: [
    { id: "prompt", type: "text_prompt", position: { x: 0, y: 0 }, data: { prompt } },
    { id: "image", type: "image_generator", position: { x: 250, y: 0 }, data: { model: "mock-v1" } },
    { id: "video", type: "image_to_video", position: { x: 500, y: 0 }, data: { model: "mock-v1" } },
    { id: "upscale", type: "video_upscaler", position: { x: 750, y: 0 }, data: { scale: 2 } },
    { id: "export", type: "download_export", position: { x: 1000, y: 0 }, data: { format: "json" } },
  ],
  edges: [
    { id: "e1", source: "prompt", target: "image", kind: "text" },
    { id: "e2", source: "image", target: "video", kind: "image" },
    { id: "e3", source: "video", target: "upscale", kind: "video" },
    { id: "e4", source: "upscale", target: "export", kind: "video" },
  ],
});

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

export const newApi = async (label = "api") => {
  serial += 1;
  return playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL, "CF-Connecting-IP": `198.51.100.${serial % 240}` , "X-E2E-Context": label } });
};

export const call = (api: APIRequestContext, path: string, options: { method?: string; cookie?: string; data?: unknown; headers?: Record<string, string> } = {}) => api.fetch(path, {
  method: options.method || "GET",
  headers: { ...(options.cookie ? { Cookie: options.cookie } : {}), ...(options.headers || {}) },
  data: options.data,
  failOnStatusCode: false,
  maxRedirects: 0,
});

export const payload = async <T = Record<string, unknown>>(response: APIResponse) => ({ response, body: await response.json() as T });

export const register = async (api: APIRequestContext, email = uniqueEmail("creator"), password = PASSWORD) => {
  const response = await call(api, "/api/auth/register", { method: "POST", data: { name: "E2E Creator", email, password } });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const cookie = response.headers()["set-cookie"]?.split(";")[0] || "";
  expect(cookie).toContain("shazan_session");
  return { email, password, cookie, user: body.user as { id: string; role: string } };
};

export const createProject = async (api: APIRequestContext, cookie: string, prompt = "A cinematic city") => {
  const created = await payload<{ project: { id: string } }>(await call(api, "/api/v1/projects", { method: "POST", cookie, data: { name: `E2E ${Date.now()}` } }));
  expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
  const projectId = created.body.project.id;
  const saved = await call(api, `/api/v1/projects/${projectId}/workflow`, { method: "PUT", cookie, data: { workflow: workflow(prompt), base_version: 1, reason: "Playwright workflow" } });
  expect(saved.status(), await saved.text()).toBe(200);
  return projectId;
};

export const runJob = async (api: APIRequestContext, cookie: string, projectId: string, key = `e2e:${crypto.randomUUID()}`) => {
  const result = await payload<{ job: { id: string; status: string; result_url?: string } }>(await call(api, `/api/v1/projects/${projectId}/runs`, { method: "POST", cookie, headers: { "Idempotency-Key": key }, data: { provider: "mock" } }));
  expect(result.response.status(), JSON.stringify(result.body)).toBe(202);
  return result.body.job;
};

export const waitForJob = async (api: APIRequestContext, cookie: string, jobId: string, terminal = ["completed", "failed", "cancelled"], attempts = 45) => {
  let body: { job: { id: string; status: string; result_url?: string } } = { job: { id: jobId, status: "queued" } };
  for (let index = 0; index < attempts; index += 1) {
    const response = await call(api, `/api/v1/jobs/${jobId}`, { cookie });
    body = await response.json();
    if (terminal.includes(body.job.status)) return body.job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Job ${jobId} did not reach ${terminal.join(",")}; status=${body.job.status}`);
};
