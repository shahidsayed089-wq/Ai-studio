export const WORKFLOW_NODE_TYPES = Object.freeze({
  text_prompt: { label: "Text Prompt", inputs: [], outputs: ["text"], credits: 0 },
  image_upload: { label: "Image Upload", inputs: [], outputs: ["image"], credits: 0 },
  image_generator: { label: "Image Generator", inputs: ["text", "image"], outputs: ["image"], credits: 12 },
  image_to_video: { label: "Image-to-Video", inputs: ["image", "text"], outputs: ["video"], credits: 40 },
  text_to_video: { label: "Text-to-Video", inputs: ["text"], outputs: ["video"], credits: 48 },
  video_upscaler: { label: "Video Upscaler", inputs: ["video"], outputs: ["video"], credits: 18 },
  result_preview: { label: "Result Preview", inputs: ["image", "video"], outputs: ["image", "video"], credits: 0 },
  download_export: { label: "Download / Export", inputs: ["image", "video"], outputs: [], credits: 0 },
});

export const JOB_STATUSES = Object.freeze(["queued", "processing", "completed", "failed", "cancelled"]);

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const cleanString = (value, maximum = 200) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

export const sanitizeFilename = (value) => {
  const source = cleanString(value, 180).normalize("NFKC");
  const withoutPath = source.split(/[\\/]/).pop() || "asset";
  const safe = withoutPath.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (safe || "asset").slice(0, 120);
};

export const validateWorkflow = (workflow) => {
  if (!isRecord(workflow)) return { ok: false, error: "Workflow object required." };
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  if (!nodes.length) return { ok: false, error: "Workflow mein kam se kam ek node required hai." };
  if (nodes.length > 80 || edges.length > 160) return { ok: false, error: "Workflow limit 80 nodes aur 160 connections hai." };

  const nodeMap = new Map();
  for (const node of nodes) {
    if (!isRecord(node)) return { ok: false, error: "Invalid node." };
    const id = cleanString(node.id, 80);
    const type = cleanString(node.type, 60);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !WORKFLOW_NODE_TYPES[type]) return { ok: false, error: "Unknown workflow node." };
    if (nodeMap.has(id)) return { ok: false, error: "Duplicate node ID." };
    const x = Number(node.position?.x);
    const y = Number(node.position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 20000 || Math.abs(y) > 20000) return { ok: false, error: "Invalid node position." };
    const data = isRecord(node.data) ? node.data : {};
    const normalizedData = {};
    for (const [key, value] of Object.entries(data).slice(0, 20)) {
      if (!/^[a-zA-Z0-9_-]{1,50}$/.test(key)) continue;
      if (["string", "number", "boolean"].includes(typeof value)) normalizedData[key] = typeof value === "string" ? value.slice(0, 5000) : value;
    }
    nodeMap.set(id, { id, type, position: { x, y }, data: normalizedData });
  }

  const normalizedEdges = [];
  const edgeIds = new Set();
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (!isRecord(edge)) return { ok: false, error: "Invalid connection." };
    const id = cleanString(edge.id, 100);
    const source = cleanString(edge.source, 80);
    const target = cleanString(edge.target, 80);
    const kind = cleanString(edge.kind, 20) || "auto";
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || edgeIds.has(id)) return { ok: false, error: "Duplicate connection ID." };
    if (!nodeMap.has(source) || !nodeMap.has(target) || source === target) return { ok: false, error: "Connection node missing." };
    const sourceDef = WORKFLOW_NODE_TYPES[nodeMap.get(source).type];
    const targetDef = WORKFLOW_NODE_TYPES[nodeMap.get(target).type];
    const compatible = kind === "auto" || (sourceDef.outputs.includes(kind) && targetDef.inputs.includes(kind));
    if (!compatible) return { ok: false, error: `Incompatible ${kind} connection.` };
    edgeIds.add(id);
    normalizedEdges.push({ id, source, target, kind });
    adjacency.get(source).push(target);
    indegree.set(target, indegree.get(target) + 1);
  }

  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const target of adjacency.get(id)) {
      const next = indegree.get(target) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  if (order.length !== nodes.length) return { ok: false, error: "Workflow cycles allowed nahi hain." };

  const normalizedNodes = [...nodeMap.values()];
  const executable = normalizedNodes.some((node) => WORKFLOW_NODE_TYPES[node.type].credits > 0);
  if (!executable) return { ok: false, error: "Workflow mein generation ya upscaler node required hai." };
  return { ok: true, workflow: { nodes: normalizedNodes, edges: normalizedEdges }, order };
};

export const calculateWorkflowCost = (workflow, provider = "mock") => {
  const validation = validateWorkflow(workflow);
  if (!validation.ok) return { ok: false, error: validation.error, credits: 0 };
  const multiplier = provider === "mock" ? 1 : 2;
  const credits = validation.workflow.nodes.reduce((total, node) => total + WORKFLOW_NODE_TYPES[node.type].credits * multiplier, 0);
  return { ok: true, credits: Math.max(1, Math.round(credits)), breakdown: validation.workflow.nodes.filter((node) => WORKFLOW_NODE_TYPES[node.type].credits > 0).map((node) => ({ node_id: node.id, type: node.type, credits: WORKFLOW_NODE_TYPES[node.type].credits * multiplier })) };
};

export const canonicalWorkflow = (workflow) => {
  const validation = validateWorkflow(workflow);
  if (!validation.ok) return "";
  return JSON.stringify({
    nodes: [...validation.workflow.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...validation.workflow.edges].sort((a, b) => a.id.localeCompare(b.id)),
  });
};

export const canTransitionJob = (from, to) => {
  const allowed = {
    queued: new Set(["processing", "failed", "cancelled"]),
    processing: new Set(["completed", "failed", "cancelled"]),
    completed: new Set(),
    failed: new Set(),
    cancelled: new Set(),
  };
  return Boolean(allowed[from]?.has(to));
};

export const retryDelaySeconds = (attempt) => Math.min(300, Math.max(2, 2 ** Math.max(1, Number(attempt) || 1)));

export const mockProgressForAge = (ageSeconds) => {
  const age = Math.max(0, Number(ageSeconds) || 0);
  if (age < 2) return { status: "queued", progress: Math.min(12, Math.round(age * 6)) };
  if (age < 10) return { status: "processing", progress: Math.min(92, 12 + Math.round((age - 2) * 10)) };
  return { status: "completed", progress: 100 };
};

export const safePagination = (searchParams) => ({
  page: Math.min(500, Math.max(1, Number(searchParams.get("page")) || 1)),
  limit: Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20)),
});
