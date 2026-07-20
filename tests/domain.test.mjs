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
