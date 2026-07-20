"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./studio.css";

type NodeType = "text_prompt" | "image_upload" | "image_generator" | "image_to_video" | "text_to_video" | "video_upscaler" | "result_preview" | "download_export";
type WorkflowNode = { id: string; type: NodeType; position: { x: number; y: number }; data: Record<string, string | number | boolean> };
type WorkflowEdge = { id: string; source: string; target: string; kind: string };
type Workflow = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
type Project = { id: string; name: string; description: string; workflow: Workflow; version: number; created_at: number; updated_at: number };
type Job = { id: string; project_id: string; provider: string; status: "queued" | "processing" | "completed" | "failed" | "cancelled"; progress: number; estimated_credits: number; attempt: number; max_attempts: number; result_asset_id?: string | null; result_url?: string | null; error?: string | null; created_at: number };
type Asset = { id: string; project_id?: string | null; kind: string; source: string; filename: string; content_type: string; size_bytes: number; created_at: number; content_url: string };
type User = { id: string; name: string; email: string; role: string; credits: number };
type Wallet = { available: number; reserved: number; spent: number };
type LedgerEntry = { id: string; job_id?: string | null; entry_type: "grant" | "reserve" | "charge" | "refund" | "admin_adjustment"; available_delta: number; reserved_delta: number; spent_delta: number; reason: string; created_at: number };
type Version = { id: string; version_number: number; reason: string; created_at: number };

const nodeCatalog: { type: NodeType; label: string; group: string; icon: string; description: string }[] = [
  { type: "text_prompt", label: "Text Prompt", group: "INPUT", icon: "T", description: "Prompt, script or instruction" },
  { type: "image_upload", label: "Image Upload", group: "INPUT", icon: "↑", description: "R2-backed visual reference" },
  { type: "image_generator", label: "Image Generator", group: "GENERATE", icon: "✦", description: "Text or image to image" },
  { type: "image_to_video", label: "Image-to-Video", group: "GENERATE", icon: "▶", description: "Animate a source frame" },
  { type: "text_to_video", label: "Text-to-Video", group: "GENERATE", icon: "◉", description: "Prompt to cinematic shot" },
  { type: "video_upscaler", label: "Video Upscaler", group: "ENHANCE", icon: "4K", description: "Restore and enlarge video" },
  { type: "result_preview", label: "Result Preview", group: "OUTPUT", icon: "▣", description: "Inspect generated media" },
  { type: "download_export", label: "Download / Export", group: "OUTPUT", icon: "↓", description: "Durable downloadable result" },
];

const labelFor = (type: NodeType) => nodeCatalog.find((item) => item.type === type)?.label || type;
const emptyWorkflow: Workflow = { nodes: [], edges: [] };
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  return payload as T;
};
const formatDate = (seconds: number) => new Date(seconds * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const shortCredits = (value: number) => new Intl.NumberFormat().format(value || 0);

export default function ProCanvas() {
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet>({ available: 0, reserved: 0, spent: 0 });
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [workflow, setWorkflow] = useState<Workflow>(emptyWorkflow);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [connectingFrom, setConnectingFrom] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [jobFilter, setJobFilter] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetKind, setAssetKind] = useState("");
  const [assetSort, setAssetSort] = useState<"newest" | "name">("newest");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "conflict" | "error">("saved");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedProject = useRef<string>("");
  const eventSource = useRef<EventSource | null>(null);
  const landingInputsApplied = useRef(false);

  const selectedNode = useMemo(() => workflow.nodes.find((node) => node.id === selectedNodeId) || null, [workflow.nodes, selectedNodeId]);
  const visibleJobs = useMemo(() => jobFilter ? jobs.filter((job) => job.status === jobFilter) : jobs, [jobs, jobFilter]);
  const visibleAssets = useMemo(() => assets.filter((asset) => (!assetKind || asset.kind === assetKind) && (!assetSearch || asset.filename.toLowerCase().includes(assetSearch.toLowerCase()))).sort((a, b) => assetSort === "name" ? a.filename.localeCompare(b.filename) : b.created_at - a.created_at), [assetKind, assetSearch, assetSort, assets]);

  const refreshWallet = useCallback(async () => {
    const result = await api<{ wallet: Wallet; ledger: LedgerEntry[] }>("/api/v1/credits?limit=100");
    setWallet(result.wallet);
    setLedger(result.ledger);
  }, []);

  const refreshAssets = useCallback(async (projectId?: string) => {
    const result = await api<{ assets: Asset[] }>(`/api/v1/assets?limit=50${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ""}`);
    setAssets(result.assets);
  }, []);

  const refreshJobs = useCallback(async (projectId?: string) => {
    const result = await api<{ jobs: Job[] }>(`/api/v1/jobs?limit=50${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ""}`);
    setJobs(result.jobs);
    const live = result.jobs.find((job) => job.status === "queued" || job.status === "processing");
    if (live) setActiveJob(live);
    return live;
  }, []);

  const loadVersions = useCallback(async (projectId: string) => {
    const result = await api<{ versions: Version[] }>(`/api/v1/projects/${projectId}/versions`);
    setVersions(result.versions);
  }, []);

  const selectProject = useCallback(async (projectId: string) => {
    setError("");
    const result = await api<{ project: Project }>(`/api/v1/projects/${projectId}`);
    hydratedProject.current = result.project.id;
    setProject(result.project);
    let nextWorkflow = result.project.workflow;
    let importedLandingInputs = false;
    if (!landingInputsApplied.current) {
      landingInputsApplied.current = true;
      const parameters = new URLSearchParams(window.location.search);
      const incomingPrompt = (parameters.get("prompt") || "").slice(0, 5000);
      const incomingModel = (parameters.get("model") || "").slice(0, 120);
      const incomingMode = parameters.get("mode") || "";
      if (incomingPrompt || incomingModel) {
        nextWorkflow = {
          ...nextWorkflow,
          nodes: nextWorkflow.nodes.map((node) => {
            if (incomingPrompt && node.type === "text_prompt") return { ...node, data: { ...node.data, prompt: incomingPrompt } };
            const target = incomingMode === "image" ? "image_generator" : incomingMode === "video" ? "image_to_video" : "";
            if (incomingModel && node.type === target) return { ...node, data: { ...node.data, model: incomingModel } };
            return node;
          }),
        };
        importedLandingInputs = true;
      }
    }
    setWorkflow(nextWorkflow);
    setSelectedNodeId(nextWorkflow.nodes[0]?.id || "");
    setSaveState(importedLandingInputs ? "dirty" : "saved");
    await Promise.all([refreshAssets(projectId), refreshJobs(projectId), loadVersions(projectId)]);
  }, [loadVersions, refreshAssets, refreshJobs]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [session, projectList, credits] = await Promise.all([
        api<{ authenticated: boolean; user: User }>("/api/auth/session"),
        api<{ projects: Project[] }>("/api/v1/projects?limit=50"),
        api<{ wallet: Wallet; ledger: LedgerEntry[] }>("/api/v1/credits?limit=100"),
      ]);
      if (!session.authenticated) { window.location.href = "/?auth=login&next=/advanced/canvas"; return; }
      setUser(session.user);
      setWallet(credits.wallet);
      setLedger(credits.ledger);
      let list = projectList.projects;
      if (!list.length) {
        const created = await api<{ project: Project }>("/api/v1/projects", { method: "POST", body: JSON.stringify({ name: "My first AI workflow" }) });
        list = [created.project];
      }
      setProjects(list);
      await selectProject(list[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Studio load failed");
    } finally {
      setLoading(false);
    }
  }, [selectProject]);

  useEffect(() => { const timer = window.setTimeout(() => void bootstrap(), 0); return () => { window.clearTimeout(timer); eventSource.current?.close(); }; }, [bootstrap]);

  useEffect(() => {
    if (!project || hydratedProject.current !== project.id || saveState !== "dirty") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const result = await api<{ project: Project; unchanged?: boolean }>(`/api/v1/projects/${project.id}/workflow`, { method: "PUT", body: JSON.stringify({ workflow, base_version: project.version, reason: "Canvas auto-save" }) });
        hydratedProject.current = result.project.id;
        setProject(result.project);
        setProjects((current) => current.map((item) => item.id === result.project.id ? { ...item, ...result.project } : item));
        setSaveState("saved");
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Auto-save failed";
        setSaveState(/dusre tab|conflict/i.test(message) ? "conflict" : "error");
        setError(message);
      }
    }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [project, saveState, workflow]);

  const activeJobId = activeJob?.id;
  const activeJobStatus = activeJob?.status;
  const activeJobProjectId = activeJob?.project_id;

  useEffect(() => {
    eventSource.current?.close();
    if (!activeJobId || !activeJobStatus || !["queued", "processing"].includes(activeJobStatus)) return;
    const stream = new EventSource(`/api/v1/jobs/${activeJobId}/events`);
    eventSource.current = stream;
    stream.addEventListener("progress", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as Job;
      setActiveJob(next);
      setJobs((current) => [next, ...current.filter((job) => job.id !== next.id)]);
      if (["completed", "failed", "cancelled"].includes(next.status)) {
        stream.close();
        setRunning(false);
        void Promise.all([refreshWallet(), refreshAssets(next.project_id), refreshJobs(next.project_id)]);
        setNotice(next.status === "completed" ? "Workflow completed. Result durable storage mein ready hai." : next.status === "failed" ? "Workflow permanently failed; reserved credits refunded." : "Workflow cancelled; reserved credits refunded.");
      }
    });
    stream.onerror = () => { stream.close(); if (activeJobProjectId) window.setTimeout(() => void refreshJobs(activeJobProjectId), 1500); };
    return () => stream.close();
  }, [activeJobId, activeJobStatus, activeJobProjectId, refreshAssets, refreshJobs, refreshWallet]);

  const mutateWorkflow = (next: Workflow) => { setWorkflow(next); setSaveState("dirty"); setError(""); };
  const addNode = (type: NodeType, position?: { x: number; y: number }) => {
    const next: WorkflowNode = { id: `${type}-${crypto.randomUUID().slice(0, 8)}`, type, position: position || { x: 120 + workflow.nodes.length * 24, y: 120 + workflow.nodes.length * 18 }, data: type === "text_prompt" ? { prompt: "Describe your cinematic idea" } : type.includes("generator") || type.includes("video") ? { model: "mock-v1" } : {} };
    let nextEdges = workflow.edges;
    if (type === "video_upscaler") {
      const exportNode = workflow.nodes.find((node) => node.type === "download_export");
      const incomingVideo = exportNode && workflow.edges.find((edge) => edge.target === exportNode.id && edge.kind === "video");
      if (exportNode && incomingVideo) {
        nextEdges = [
          ...workflow.edges.filter((edge) => edge.id !== incomingVideo.id),
          { id: `edge-${crypto.randomUUID().slice(0, 8)}`, source: incomingVideo.source, target: next.id, kind: "video" },
          { id: `edge-${crypto.randomUUID().slice(0, 8)}`, source: next.id, target: exportNode.id, kind: "video" },
        ];
      }
    }
    mutateWorkflow({ nodes: [...workflow.nodes, next], edges: nextEdges });
    setSelectedNodeId(next.id);
    setRightOpen(true);
  };
  const removeNode = (nodeId: string) => {
    mutateWorkflow({ nodes: workflow.nodes.filter((node) => node.id !== nodeId), edges: workflow.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId) });
    if (selectedNodeId === nodeId) setSelectedNodeId("");
  };
  const moveNode = (nodeId: string, x: number, y: number) => mutateWorkflow({ ...workflow, nodes: workflow.nodes.map((node) => node.id === nodeId ? { ...node, position: { x: Math.max(20, x), y: Math.max(20, y) } } : node) });
  const connectTo = (target: string) => {
    if (!connectingFrom || connectingFrom === target || workflow.edges.some((edge) => edge.source === connectingFrom && edge.target === target)) { setConnectingFrom(""); return; }
    mutateWorkflow({ ...workflow, edges: [...workflow.edges, { id: `edge-${crypto.randomUUID().slice(0, 8)}`, source: connectingFrom, target, kind: "auto" }] });
    setConnectingFrom("");
  };
  const updateSelectedData = (key: string, value: string | number | boolean) => {
    if (!selectedNode) return;
    mutateWorkflow({ ...workflow, nodes: workflow.nodes.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, [key]: value } } : node) });
  };

  const createProject = async () => {
    try {
      const result = await api<{ project: Project }>("/api/v1/projects", { method: "POST", body: JSON.stringify({ name: `Untitled workflow ${projects.length + 1}` }) });
      setProjects((current) => [result.project, ...current]);
      await selectProject(result.project.id);
      setNotice("New project created.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Create failed"); }
  };
  const renameProject = async () => {
    if (!project) return;
    const name = window.prompt("Project name", project.name)?.trim();
    if (!name || name === project.name) return;
    try {
      const result = await api<{ project: Project }>(`/api/v1/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setProject(result.project);
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, name } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rename failed"); }
  };
  const duplicateProject = async () => {
    if (!project) return;
    try {
      const result = await api<{ project: Project }>(`/api/v1/projects/${project.id}/duplicate`, { method: "POST", body: "{}" });
      setProjects((current) => [result.project, ...current]);
      await selectProject(result.project.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Duplicate failed"); }
  };
  const deleteProject = async () => {
    if (!project || projects.length < 2 || !window.confirm(`Delete ${project.name}?`)) return;
    try {
      await api(`/api/v1/projects/${project.id}`, { method: "DELETE" });
      const remaining = projects.filter((item) => item.id !== project.id);
      setProjects(remaining);
      await selectProject(remaining[0].id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Delete failed"); }
  };

  const runWorkflow = async () => {
    if (!project || running || saveState === "conflict") return;
    setRunning(true); setError(""); setNotice("");
    try {
      if (saveState === "dirty" || saveState === "saving") {
        const saved = await api<{ project: Project }>(`/api/v1/projects/${project.id}/workflow`, { method: "PUT", body: JSON.stringify({ workflow, base_version: project.version, reason: "Pre-run save" }) });
        setProject(saved.project); setSaveState("saved"); hydratedProject.current = saved.project.id;
      }
      const idempotencyKey = `run:${project.id}:${crypto.randomUUID()}`;
      const result = await api<{ job: Job }>(`/api/v1/projects/${project.id}/runs`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ provider: "mock" }) });
      setActiveJob(result.job);
      setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
      await refreshWallet();
    } catch (reason) { setRunning(false); setError(reason instanceof Error ? reason.message : "Run failed"); }
  };
  const cancelJob = async (job: Job) => { try { const result = await api<{ job: Job }>(`/api/v1/jobs/${job.id}/cancel`, { method: "POST", body: "{}" }); setActiveJob(result.job); await refreshWallet(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Cancel failed"); } };
  const retryJob = async (job: Job) => { try { const result = await api<{ job: Job }>(`/api/v1/jobs/${job.id}/retry`, { method: "POST", headers: { "Idempotency-Key": `retry:${job.id}:${crypto.randomUUID()}` }, body: "{}" }); setActiveJob(result.job); setRunning(true); await refreshWallet(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Retry failed"); } };

  const uploadAsset = async (file: File) => {
    if (!project) return;
    setNotice("Uploading asset…"); setError("");
    try {
      await api<{ asset: Asset }>("/api/v1/assets", { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": file.name, "X-Project-Id": project.id }, body: file });
      await refreshAssets(project.id); setNotice("Asset uploaded to durable SHAZAN storage.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed"); }
  };
  const deleteAsset = async (asset: Asset) => {
    if (!project || !window.confirm(`Delete ${asset.filename}?`)) return;
    try { await api(`/api/v1/assets/${asset.id}`, { method: "DELETE" }); await refreshAssets(project.id); setNotice("Asset removed from SHAZAN storage."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Asset delete failed"); }
  };
  const shareProject = async () => {
    if (!project) return;
    try {
      const result = await api<{ share: { url: string } }>(`/api/v1/projects/${project.id}/share`, { method: "POST", body: JSON.stringify({ days: 30 }) });
      await navigator.clipboard.writeText(result.share.url);
      setNotice("Read-only share link copied. It expires in 30 days.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Share failed"); }
  };
  const restoreVersion = async (versionId: string) => {
    if (!project || !window.confirm("Restore this version as a new version?")) return;
    try { const result = await api<{ project: Project }>(`/api/v1/projects/${project.id}/versions/${versionId}/restore`, { method: "POST", body: "{}" }); hydratedProject.current = result.project.id; setProject(result.project); setWorkflow(result.project.workflow); setSaveState("saved"); await loadVersions(project.id); } catch (reason) { setError(reason instanceof Error ? reason.message : "Restore failed"); }
  };

  if (loading) return <main className="studio-loading"><span className="studio-spinner" /><h1>Opening SHAZAN AI Pro Canvas</h1><p>Restoring projects, queue and credits…</p></main>;

  return (
    <main className="studio-shell">
      <header className="studio-topbar">
        <Link className="studio-brand" href="/"><span>✦</span><b>SHAZAN AI</b><em>PRO CANVAS — ADVANCED</em></Link>
        <div className="project-switcher">
          <button className="mobile-panel-button" onClick={() => setLeftOpen(true)}>☰</button>
          <select value={project?.id || ""} onChange={(event) => void selectProject(event.target.value)} aria-label="Current project">
            {projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <button onClick={renameProject} title="Rename project">Rename</button>
          <button onClick={duplicateProject} title="Duplicate project">Duplicate</button>
          <button onClick={deleteProject} disabled={projects.length < 2} title="Delete project">Delete</button>
        </div>
        <div className="studio-actions">
          <span className={`save-indicator ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved" : saveState === "conflict" ? "Conflict" : saveState === "error" ? "Save failed" : "Saved"}</span>
          <button className="share-button" onClick={shareProject}>Share</button>
          <button className="run-button" onClick={runWorkflow} disabled={running || !workflow.nodes.length}><span>▶</span>{running ? "Running" : "Run workflow"}</button>
          <button className="mobile-panel-button" onClick={() => setRightOpen(true)}>⚙</button>
        </div>
      </header>

      {(error || notice) && <div className={error ? "studio-alert error" : "studio-alert success"}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}

      <div className="studio-main">
        <aside className={`node-library ${leftOpen ? "open" : ""}`}>
          <div className="panel-heading"><span><small>BUILD</small><b>Node library</b></span><button onClick={() => setLeftOpen(false)}>×</button></div>
          <button className="new-project-button" onClick={createProject}>＋ New project</button>
          {["INPUT", "GENERATE", "ENHANCE", "OUTPUT"].map((group) => <section key={group}><h3>{group}</h3>{nodeCatalog.filter((item) => item.group === group).map((item) => <button className="library-node" draggable onDragStart={(event) => event.dataTransfer.setData("application/shazan-node", item.type)} onClick={() => addNode(item.type)} key={item.type}><span>{item.icon}</span><i><b>{item.label}</b><small>{item.description}</small></i><em>＋</em></button>)}</section>)}
          <div className="account-card"><span>{user?.name.slice(0, 1).toUpperCase()}</span><i><b>{user?.name}</b><small>{user?.role} · {user?.email}</small></i><a href="/api/auth/logout" onClick={(event) => { event.preventDefault(); void api("/api/auth/logout", { method: "POST", body: "{}" }).then(() => { window.location.href = "/"; }); }}>Sign out</a></div>
        </aside>

        <section className="canvas-column">
          <div className="canvas-toolbar">
            <span><b>{project?.name}</b><small>v{project?.version} · {workflow.nodes.length} nodes · {workflow.edges.length} edges</small></span>
            <div><button onClick={() => setHistoryOpen((value) => !value)}>Versions</button><button onClick={() => { if (project) void selectProject(project.id); }}>Reload</button><button onClick={() => { setWorkflow(emptyWorkflow); setSaveState("dirty"); }}>Clear</button></div>
          </div>
          <div className="workflow-canvas" ref={canvasRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const type = event.dataTransfer.getData("application/shazan-node") as NodeType; const rect = canvasRef.current?.getBoundingClientRect(); if (rect && nodeCatalog.some((item) => item.type === type)) addNode(type, { x: event.clientX - rect.left - 105, y: event.clientY - rect.top - 35 }); }}>
            <div className="canvas-grid" />
            <svg className="edge-layer" aria-label="Workflow connections">
              {workflow.edges.map((edge) => { const source = workflow.nodes.find((node) => node.id === edge.source); const target = workflow.nodes.find((node) => node.id === edge.target); if (!source || !target) return null; const x1 = source.position.x + 210; const y1 = source.position.y + 45; const x2 = target.position.x; const y2 = target.position.y + 45; const bend = Math.max(60, Math.abs(x2 - x1) * 0.45); return <g key={edge.id}><title>Double-click to remove connection</title><path onDoubleClick={() => mutateWorkflow({ ...workflow, edges: workflow.edges.filter((item) => item.id !== edge.id) })} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} /></g>; })}
            </svg>
            {!workflow.nodes.length && <div className="canvas-empty"><span>✦</span><h2>Build your first AI workflow</h2><p>Drag nodes here or tap a node in the library.</p><button onClick={() => addNode("text_prompt")}>Add Text Prompt</button></div>}
            {workflow.nodes.map((node) => <article className={`canvas-node node-${node.type} ${selectedNodeId === node.id ? "selected" : ""}`} style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }} draggable onDragEnd={(event) => { const rect = canvasRef.current?.getBoundingClientRect(); if (rect) moveNode(node.id, event.clientX - rect.left - 105, event.clientY - rect.top - 35); }} onClick={() => { setSelectedNodeId(node.id); setRightOpen(true); }} key={node.id}>
              <button className={`node-port input ${connectingFrom ? "ready" : ""}`} aria-label={`Connect into ${labelFor(node.type)}`} onClick={(event) => { event.stopPropagation(); connectTo(node.id); }} />
              <header><span>{nodeCatalog.find((item) => item.type === node.type)?.icon}</span><i><small>{nodeCatalog.find((item) => item.type === node.type)?.group}</small><b>{labelFor(node.type)}</b></i><button onClick={(event) => { event.stopPropagation(); removeNode(node.id); }} aria-label="Delete node">×</button></header>
              <div><p>{node.type === "text_prompt" ? String(node.data.prompt || "Enter prompt") : node.type === "image_upload" ? String(node.data.filename || "Select an asset") : String(node.data.model || "Mock Provider")}</p><small>{workflow.edges.filter((edge) => edge.target === node.id).length} in · {workflow.edges.filter((edge) => edge.source === node.id).length} out</small></div>
              <button className={`node-port output ${connectingFrom === node.id ? "active" : ""}`} aria-label={`Connect from ${labelFor(node.type)}`} onClick={(event) => { event.stopPropagation(); setConnectingFrom(connectingFrom === node.id ? "" : node.id); }} />
            </article>)}
          </div>

          {historyOpen && <div className="version-drawer"><header><span><small>PROJECT HISTORY</small><b>Version restore</b></span><button onClick={() => setHistoryOpen(false)}>×</button></header>{versions.length ? versions.map((version) => <button key={version.id} onClick={() => restoreVersion(version.id)}><span><b>Version {version.version_number}</b><small>{version.reason}</small></span><em>{formatDate(version.created_at)}</em></button>) : <p>No versions yet.</p>}</div>}

          <section className="job-dock">
            <header><span><small>PERSISTENT QUEUE</small><b>Job history</b></span><select value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}><option value="">All statuses</option><option>queued</option><option>processing</option><option>completed</option><option>failed</option><option>cancelled</option></select></header>
            <div className="job-list">{visibleJobs.length ? visibleJobs.slice(0, 8).map((job) => <article key={job.id}><span className={`job-status ${job.status}`}>{job.status}</span><i><b>{job.provider.toUpperCase()} · {job.estimated_credits} credits</b><small>{job.id.slice(0, 8)} · attempt {job.attempt}/{job.max_attempts} · {formatDate(job.created_at)}</small><span className="job-progress"><em style={{ width: `${job.progress}%` }} /></span>{job.error && <small className="job-error">{job.error}</small>}</i><div>{["queued","processing"].includes(job.status) && <button onClick={() => cancelJob(job)}>Cancel</button>}{["failed","cancelled"].includes(job.status) && <button onClick={() => retryJob(job)}>Retry</button>}{job.status === "completed" && job.result_url && <a href={job.result_url} download>Download</a>}</div></article>) : <p className="empty-copy">No jobs match this filter.</p>}</div>
          </section>
        </section>

        <aside className={`inspector-panel ${rightOpen ? "open" : ""}`}>
          <div className="panel-heading"><span><small>CONTROL</small><b>Inspector</b></span><button onClick={() => setRightOpen(false)}>×</button></div>
          <section className="wallet-panel"><header><span><small>AVAILABLE</small><b>{shortCredits(wallet.available)}</b></span><em>credits</em></header><div><span><b>{shortCredits(wallet.reserved)}</b><small>reserved</small></span><span><b>{shortCredits(wallet.spent)}</b><small>spent</small></span></div></section>
          <details className="credit-ledger-panel"><summary><span><small>ATOMIC WALLET</small><b>Credit ledger</b></span><em>{ledger.length} entries</em></summary><div>{ledger.length ? ledger.map((entry) => <article key={entry.id}><span className={entry.entry_type}>{entry.entry_type}</span><i><b>{entry.reason}</b><small>{formatDate(entry.created_at)}{entry.job_id ? ` · ${entry.job_id.slice(0, 8)}` : ""}</small></i><em className={entry.available_delta >= 0 ? "positive" : "negative"}>{entry.available_delta > 0 ? "+" : ""}{entry.available_delta}</em></article>) : <p>No ledger entries.</p>}</div></details>
          {selectedNode ? <section className="node-inspector"><span className="inspector-node-icon">{nodeCatalog.find((item) => item.type === selectedNode.type)?.icon}</span><small>SELECTED NODE</small><h2>{labelFor(selectedNode.type)}</h2><label><span>Node ID</span><input value={selectedNode.id} readOnly /></label>{selectedNode.type === "text_prompt" && <label><span>Prompt</span><textarea value={String(selectedNode.data.prompt || "")} onChange={(event) => updateSelectedData("prompt", event.target.value)} rows={7} /></label>}{selectedNode.type === "image_upload" && <><label className="asset-upload"><span>Upload image/video</span><input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ""; }} /></label><label><span>Stored asset</span><select value={String(selectedNode.data.asset_id || "")} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); updateSelectedData("asset_id", event.target.value); if (asset) updateSelectedData("filename", asset.filename); }}><option value="">Choose asset</option>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.filename}</option>)}</select></label></>}{!["text_prompt","image_upload","result_preview","download_export"].includes(selectedNode.type) && <label><span>Provider model</span><select value={String(selectedNode.data.model || "mock-v1")} onChange={(event) => updateSelectedData("model", event.target.value)}>{!["mock-v1","auto"].includes(String(selectedNode.data.model || "mock-v1")) && <option value={String(selectedNode.data.model)}>{String(selectedNode.data.model)} · Mock validation</option>}<option value="mock-v1">SHAZAN Mock v1</option><option value="auto" disabled>Auto (launch phase)</option></select></label>}<button className="delete-node-button" onClick={() => removeNode(selectedNode.id)}>Delete node</button></section> : <section className="inspector-empty"><span>◇</span><h2>Select a node</h2><p>Edit model, prompt and asset inputs here.</p></section>}
          <section className="asset-panel"><header><span><small>DURABLE R2</small><b>Project assets</b></span><label>＋<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ""; }} /></label></header><div className="asset-filters"><input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Search assets" aria-label="Search assets"/><select value={assetKind} onChange={(event) => setAssetKind(event.target.value)} aria-label="Filter asset type"><option value="">All</option><option value="image">Images</option><option value="video">Videos</option><option value="file">Files</option></select><select value={assetSort} onChange={(event) => setAssetSort(event.target.value as "newest" | "name")} aria-label="Sort assets"><option value="newest">Newest</option><option value="name">Name</option></select></div>{visibleAssets.length ? visibleAssets.slice(0, 50).map((asset) => <article className="asset-row" key={asset.id}><a href={asset.content_url} target="_blank" rel="noreferrer"><span>{asset.kind === "image" ? "▧" : asset.kind === "video" ? "▶" : "↓"}</span><i><b>{asset.filename}</b><small>{asset.source} · {(asset.size_bytes / 1024).toFixed(1)} KB</small></i></a><button onClick={() => deleteAsset(asset)} aria-label={`Delete ${asset.filename}`}>×</button></article>) : <p>No assets match this filter.</p>}</section>
          {user?.role === "admin" && <Link className="admin-link" href="/admin">Open admin dashboard →</Link>}
        </aside>
      </div>
    </main>
  );
}
