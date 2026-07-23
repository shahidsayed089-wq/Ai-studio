import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWorkflowCost,
  canTransitionJob,
  canonicalWorkflow,
  retryDelaySeconds,
  sanitizeFilename,
  validateWorkflow,
} from "../public/workflow-domain.js";
import { getProviderAdapter, listProviderAdapters } from "../public/providers/provider-registry.js";
import { buildFalTask, decodeFalRequestId, encodeFalRequestId } from "../public/providers/fal-provider.js";

const workflow = {
  nodes: [
    { id: "prompt", type: "text_prompt", position: { x: 0, y: 0 }, data: { prompt: "A cinematic city" } },
    { id: "image", type: "image_generator", position: { x: 250, y: 0 }, data: { model: "mock" } },
    { id: "video", type: "image_to_video", position: { x: 500, y: 0 }, data: { model: "mock" } },
    { id: "upscale", type: "video_upscaler", position: { x: 750, y: 0 }, data: { scale: 2 } },
    { id: "export", type: "download_export", position: { x: 1000, y: 0 }, data: { format: "json" } },
  ],
  edges: [
    { id: "e1", source: "prompt", target: "image", kind: "text" },
    { id: "e2", source: "image", target: "video", kind: "image" },
    { id: "e3", source: "video", target: "upscale", kind: "video" },
    { id: "e4", source: "upscale", target: "export", kind: "video" },
  ],
};

test("validates and canonicalizes an executable DAG", () => {
  assert.equal(validateWorkflow(workflow).ok, true);
  assert.equal(canonicalWorkflow(workflow), canonicalWorkflow({ nodes: [...workflow.nodes].reverse(), edges: [...workflow.edges].reverse() }));
  assert.deepEqual(calculateWorkflowCost(workflow, "mock").credits, 70);
});

test("rejects cycles, incompatible edges and empty workflows", () => {
  const cyclic = structuredClone(workflow);
  cyclic.nodes.push({ id: "upscale-2", type: "video_upscaler", position: { x: 850, y: 150 }, data: { scale: 2 } });
  cyclic.edges.push({ id: "cycle-a", source: "upscale", target: "upscale-2", kind: "video" });
  cyclic.edges.push({ id: "cycle-b", source: "upscale-2", target: "upscale", kind: "video" });
  assert.match(validateWorkflow(cyclic).error, /cycles/i);
  const incompatible = structuredClone(workflow);
  incompatible.edges[0].kind = "video";
  assert.match(validateWorkflow(incompatible).error, /incompatible/i);
  assert.equal(validateWorkflow({ nodes: [], edges: [] }).ok, false);
});

test("job transition, retry and filename security rules are deterministic", () => {
  assert.equal(canTransitionJob("queued", "processing"), true);
  assert.equal(canTransitionJob("completed", "processing"), false);
  assert.deepEqual([1, 2, 3, 20].map(retryDelaySeconds), [2, 4, 8, 300]);
  assert.equal(sanitizeFilename("../../private/<script>.png"), "script-.png");
});

test("every provider exposes the production adapter contract and unconfigured adapters stay closed", async () => {
  const methods = ["validateConfiguration", "validateInput", "estimateProviderCost", "estimateCreditCost", "submitJob", "getJobStatus", "cancelJob", "normalizeResult", "normalizeError", "handleWebhook", "verifyWebhook", "checkAvailability"];
  const providers = listProviderAdapters();
  assert.deepEqual(providers.map((provider) => provider.key), ["mock", "fal", "kie", "openai", "google", "xai", "heygen", "runway", "muapi"]);
  for (const provider of providers) {
    const adapter = getProviderAdapter(provider.key);
    for (const method of methods) assert.equal(typeof adapter[method], "function", `${provider.key}.${method}`);
  }
  assert.equal((await getProviderAdapter("mock").checkAvailability()).available, true);
  assert.equal((await getProviderAdapter("fal").checkAvailability()).available, false);
});

test("fal adapter maps approved models, prices conservatively and keeps request IDs opaque", async () => {
  const liveImage = {
    nodes: [
      { id: "prompt", type: "text_prompt", position: { x: 0, y: 0 }, data: { prompt: "A cinematic golden city" } },
      { id: "image", type: "image_generator", position: { x: 250, y: 0 }, data: { model: "nano_banana_2", aspect_ratio: "16:9", resolution: "2k", duration: 5 } },
      { id: "export", type: "download_export", position: { x: 500, y: 0 }, data: { format: "png" } },
    ],
    edges: [
      { id: "e1", source: "prompt", target: "image", kind: "text" },
      { id: "e2", source: "image", target: "export", kind: "image" },
    ],
  };
  const task = buildFalTask(liveImage);
  assert.equal(task.modelPath, "fal-ai/nano-banana-2");
  assert.equal(task.input.prompt, "A cinematic golden city");
  assert.equal(getProviderAdapter("fal").calculateCost(liveImage).credits, 15);
  assert.equal((await getProviderAdapter("fal").checkAvailability({ FAL_KEY: "fal-key-for-server-only-tests" })).available, true);
  assert.equal((await getProviderAdapter("fal").checkAvailability({ "Fal ai": "legacy-cloudflare-fal-key" })).available, true);
  assert.equal((await getProviderAdapter("fal").checkAvailability({ ENABLE_FAL: "legacy-enable-fal-api-key" })).available, true);
  const encoded = encodeFalRequestId(task.modelPath, "request_12345");
  assert.deepEqual(decodeFalRequestId(encoded), { modelPath: task.modelPath, requestId: "request_12345" });
});

test("fal adapter submits, polls, normalizes and cancels through server-only queue calls", async () => {
  const liveImage = {
    nodes: [
      { id: "prompt", type: "text_prompt", position: { x: 0, y: 0 }, data: { prompt: "A real cinematic city" } },
      { id: "image", type: "image_generator", position: { x: 250, y: 0 }, data: { model: "grok_imagine_image", aspect_ratio: "16:9" } },
      { id: "export", type: "download_export", position: { x: 500, y: 0 }, data: { format: "png" } },
    ],
    edges: [
      { id: "e1", source: "prompt", target: "image", kind: "text" },
      { id: "e2", source: "image", target: "export", kind: "image" },
    ],
  };
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", authorization: init.headers?.Authorization });
    if (String(url).endsWith("/status?logs=1")) return Response.json({ status: "COMPLETED" });
    if (String(url).endsWith("/cancel")) return Response.json({ status: "CANCELLED" });
    if (String(url).includes("/requests/")) return Response.json({ images: [{ url: "https://v3.fal.media/files/result.png", content_type: "image/png" }] });
    return Response.json({ request_id: "fal_request_12345" });
  };
  try {
    const adapter = getProviderAdapter("fal");
    const env = { FAL_KEY: "server-only-fal-key-0123456789" };
    const submission = await adapter.submitJob({ workflow: liveImage, env, userId: "user-1" });
    assert.match(submission.providerRequestId, /^fal\./);
    const status = await adapter.getJobStatus({ providerRequestId: submission.providerRequestId, env });
    assert.equal(status.status, "completed");
    assert.equal(adapter.normalizeResult(status.result).url, "https://v3.fal.media/files/result.png");
    assert.equal((await adapter.cancelJob({ providerRequestId: submission.providerRequestId, env })).status, "cancelled");
    assert.equal(calls.every((call) => call.authorization === "Key server-only-fal-key-0123456789"), true);
    assert.equal(calls.some((call) => call.method === "POST"), true);
    assert.equal(calls.some((call) => call.method === "PUT"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
