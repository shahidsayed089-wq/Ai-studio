"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./library.css";

type Project = { id: string; name: string; description: string; created_at: number; updated_at: number };
type Asset = { id: string; project_id?: string | null; kind: string; source: string; filename: string; content_type: string; size_bytes: number; created_at: number; content_url: string };
type User = { name: string; email: string; role: string; credits: number };

const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init, headers: { ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  return payload as T;
};

const date = (seconds: number) => new Date(seconds * 1000).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

export default function LibraryShell({ view }: { view: "projects" | "assets" }) {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [session, projectResult, assetResult] = await Promise.all([
        request<{ authenticated: boolean; user: User }>("/api/auth/session"),
        request<{ projects: Project[] }>("/api/v1/projects?limit=100"),
        request<{ assets: Asset[] }>("/api/v1/assets?limit=100"),
      ]);
      if (!session.authenticated) { window.location.assign(`/?auth=login&next=/${view}`); return; }
      setUser(session.user);
      setProjects(projectResult.projects);
      setAssets(assetResult.assets);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Library load failed");
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const visibleProjects = useMemo(() => projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase())), [projects, query]);
  const visibleAssets = useMemo(() => assets.filter((asset) => asset.filename.toLowerCase().includes(query.toLowerCase())), [assets, query]);

  const createProject = async () => {
    const name = window.prompt("Project name", "Untitled creation")?.trim();
    if (!name) return;
    try {
      await request("/api/v1/projects", { method: "POST", body: JSON.stringify({ name }) });
      setNotice("Project created.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Project create failed"); }
  };

  const renameProject = async (project: Project) => {
    const name = window.prompt("Project name", project.name)?.trim();
    if (!name || name === project.name) return;
    try {
      await request(`/api/v1/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setNotice("Project renamed.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rename failed"); }
  };

  const duplicateProject = async (project: Project) => {
    try {
      await request(`/api/v1/projects/${project.id}/duplicate`, { method: "POST", body: "{}" });
      setNotice("Project duplicated.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Duplicate failed"); }
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Delete ${project.name}?`)) return;
    try {
      await request(`/api/v1/projects/${project.id}`, { method: "DELETE" });
      setNotice("Project deleted.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Delete failed"); }
  };

  const shareProject = async (project: Project) => {
    try {
      const result = await request<{ share: { url: string } }>(`/api/v1/projects/${project.id}/share`, { method: "POST", body: JSON.stringify({ days: 30 }) });
      await navigator.clipboard.writeText(result.share.url);
      setNotice("Read-only link copied. It expires in 30 days.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Share failed"); }
  };

  const uploadAsset = async (file: File) => {
    try {
      setNotice("Uploading securely…");
      await request("/api/v1/assets", { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": file.name }, body: file });
      setNotice("Creation uploaded.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed"); }
  };

  const deleteAsset = async (asset: Asset) => {
    if (!window.confirm(`Delete ${asset.filename}?`)) return;
    try {
      await request(`/api/v1/assets/${asset.id}`, { method: "DELETE" });
      setNotice("Creation deleted.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Delete failed"); }
  };

  return (
    <main className="library-shell">
      <header className="library-header">
        <Link href="/" className="library-brand"><span>✦</span><b>SHAZAN AI</b></Link>
        <nav><Link href="/studio">Create</Link><Link className={view === "projects" ? "active" : ""} href="/projects">Projects</Link><Link className={view === "assets" ? "active" : ""} href="/assets">My Creations</Link></nav>
        <span className="library-account"><b>{user?.name || "SHAZAN Creator"}</b><small>{user?.credits ?? 0} credits</small></span>
      </header>

      <section className="library-hero">
        <small>{view === "projects" ? "YOUR CREATIVE WORLDS" : "YOUR PRIVATE LIBRARY"}</small>
        <h1>{view === "projects" ? "Projects." : "My Creations."}</h1>
        <p>{view === "projects" ? "Create, organize, duplicate and share every SHAZAN project." : "Your uploads and generated Demo outputs remain private and available after refresh."}</p>
        <div className="library-tools">
          <input aria-label={`Search ${view}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "projects" ? "Search projects…" : "Search creations…"} />
          {view === "projects" ? <button onClick={createProject}>＋ New project</button> : <label>＋ Upload<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/aac" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = ""; }} /></label>}
        </div>
      </section>

      {(error || notice) && <div className={error ? "library-alert error" : "library-alert"}>{error || notice}<button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}

      {loading ? <section className="library-empty"><span>✦</span><h2>Opening your SHAZAN library…</h2></section> : view === "projects" ? (
        visibleProjects.length ? <section className="library-grid">{visibleProjects.map((project) => <article className="library-card" key={project.id}><span className="library-art">✦</span><small>PROJECT · {date(project.updated_at)}</small><h2>{project.name}</h2><p>{project.description || "A private SHAZAN creative project."}</p><div><Link href="/studio">Create</Link><button onClick={() => renameProject(project)}>Rename</button><button onClick={() => duplicateProject(project)}>Duplicate</button><button onClick={() => shareProject(project)}>Share</button><button onClick={() => deleteProject(project)}>Delete</button></div></article>)}</section> : <section className="library-empty"><span>◇</span><h2>No projects found.</h2><p>Start your first world in Studio.</p><Link href="/studio">Open Studio</Link></section>
      ) : (
        visibleAssets.length ? <section className="library-grid">{visibleAssets.map((asset) => <article className="library-card" key={asset.id}><span className="library-art">{asset.kind === "image" ? "▧" : asset.kind === "video" ? "▶" : "↓"}</span><small>{asset.source === "mock" ? "DEMO OUTPUT" : asset.kind.toUpperCase()} · {date(asset.created_at)}</small><h2>{asset.filename}</h2><p>{(asset.size_bytes / 1024).toFixed(1)} KB · Private SHAZAN storage</p><div><a href={asset.content_url} download>Download</a><button onClick={() => deleteAsset(asset)}>Delete</button></div></article>)}</section> : <section className="library-empty"><span>◇</span><h2>No creations found.</h2><p>Generate or upload your first creation.</p><Link href="/studio">Open Studio</Link></section>
      )}
    </main>
  );
}
