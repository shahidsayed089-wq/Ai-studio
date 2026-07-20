"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "./admin.css";
import "./pagination.css";

type Metrics = { totals: { users: number; active_users_30d: number; generations: number }; jobs_by_status: Record<string, number>; success_rate: number; failure_rate: number; providers: { provider_key: string; jobs: number; charged_credits: number }[]; recent_errors: { id: string; provider_key: string; last_error: string; updated_at: number }[] };
type AdminUser = { id: string; email: string; display_name: string; status: string; role: string; email_verified: number; available: number; reserved: number; spent: number; created_at: number; last_login_at?: number | null };
type Provider = { provider_key: string; display_name: string; enabled: number; mode: string; updated_at: number };
type Audit = { id: string; actor_user_id?: string; action: string; target_type: string; target_id?: string; reason?: string; metadata: Record<string, unknown>; created_at: number };

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => { const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status})`); return payload as T; };
const number = (value: number) => new Intl.NumberFormat().format(value || 0);
const date = (value?: number | null) => value ? new Date(value * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never";

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [logs, setLogs] = useState<Audit[]>([]);
  const [search, setSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [tab, setTab] = useState<"overview" | "users" | "providers" | "audit">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [metricResult, userResult, providerResult, auditResult] = await Promise.all([
        api<Metrics>("/api/v1/admin/metrics"),
        api<{ users: AdminUser[] }>(`/api/v1/admin/users?limit=50&page=${userPage}${search ? `&q=${encodeURIComponent(search)}` : ""}`),
        api<{ providers: Provider[] }>("/api/v1/providers"),
        api<{ logs: Audit[] }>(`/api/v1/admin/audit?limit=50&page=${auditPage}`),
      ]);
      setMetrics(metricResult); setUsers(userResult.users); setProviders(providerResult.providers); setLogs(auditResult.logs);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Admin dashboard failed"); }
    finally { setLoading(false); }
  }, [auditPage, search, userPage]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const adjustCredits = async (user: AdminUser) => {
    const raw = window.prompt(`Credit adjustment for ${user.email}. Use negative number to remove.`, "500");
    if (!raw) return;
    const delta = Number(raw);
    const reason = window.prompt("Mandatory audit reason");
    if (!Number.isInteger(delta) || !delta || !reason) return;
    try { await api(`/api/v1/admin/users/${user.id}/credits`, { method: "POST", body: JSON.stringify({ delta, reason }) }); setNotice(`Credits adjusted for ${user.email}.`); await load(); } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Adjustment failed"); }
  };
  const updateUser = async (user: AdminUser, patch: { role?: string; status?: string }) => {
    const reason = window.prompt("Mandatory audit reason"); if (!reason) return;
    try { await api(`/api/v1/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, reason }) }); setNotice(`${user.email} updated.`); await load(); } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "User update failed"); }
  };
  const toggleProvider = async (provider: Provider) => {
    const reason = window.prompt(`Reason to ${provider.enabled ? "disable" : "enable"} ${provider.display_name}`); if (!reason) return;
    try { await api(`/api/v1/admin/providers/${provider.provider_key}`, { method: "PATCH", body: JSON.stringify({ enabled: !provider.enabled, reason }) }); setNotice(`${provider.display_name} ${provider.enabled ? "disabled" : "enabled"}.`); await load(); } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Provider update failed"); }
  };

  return <main className="admin-shell">
    <header className="admin-top"><Link href="/studio"><span>✦</span><b>SHAZAN AI</b><em>ADMIN CONTROL</em></Link><nav>{(["overview","users","providers","audit"] as const).map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav><button onClick={() => void load()}>Refresh</button></header>
    {(error || notice) && <div className={error ? "admin-message error" : "admin-message success"}>{error || notice}<button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
    <section className="admin-heading"><span><small>SHAZAN OPERATIONS</small><h1>{tab === "overview" ? "Production intelligence." : tab === "users" ? "User control." : tab === "providers" ? "Provider routing." : "Immutable audit trail."}</h1></span><p>Every privileged mutation requires a reason and is recorded with actor, target, timestamp and hashed request IP.</p></section>
    {loading ? <section className="admin-loading"><span /><p>Loading secure metrics…</p></section> : <>
      {tab === "overview" && metrics && <section className="overview-grid">
        <div className="metric-row"><article><small>TOTAL USERS</small><b>{number(metrics.totals.users)}</b><em>{number(metrics.totals.active_users_30d)} active / 30d</em></article><article><small>GENERATIONS</small><b>{number(metrics.totals.generations)}</b><em>{number(metrics.jobs_by_status.processing || 0)} processing</em></article><article><small>SUCCESS RATE</small><b>{metrics.success_rate}%</b><em>{metrics.failure_rate}% failure</em></article><article><small>CHARGED CREDITS</small><b>{number(metrics.providers.reduce((total, item) => total + Number(item.charged_credits || 0), 0))}</b><em>provider total</em></article></div>
        <article className="admin-card provider-usage"><header><span><small>USAGE</small><b>Provider-wise jobs and cost</b></span></header>{metrics.providers.length ? metrics.providers.map((item) => <div key={item.provider_key}><span><b>{item.provider_key.toUpperCase()}</b><small>{number(item.jobs)} jobs</small></span><em>{number(item.charged_credits)} credits</em></div>) : <p>No provider usage yet.</p>}</article>
        <article className="admin-card errors-card"><header><span><small>OBSERVABILITY</small><b>Recent errors</b></span></header>{metrics.recent_errors.length ? metrics.recent_errors.map((item) => <div key={item.id}><span><b>{item.provider_key.toUpperCase()} · {item.id.slice(0,8)}</b><small>{item.last_error}</small></span><em>{date(item.updated_at)}</em></div>) : <p>No recent generation errors.</p>}</article>
      </section>}
      {tab === "users" && <section className="admin-card users-card"><header><span><small>IDENTITIES + WALLETS</small><b>User management</b></span><form onSubmit={(event) => { event.preventDefault(); setUserPage(1); void load(); }}><input value={search} onChange={(event) => { setSearch(event.target.value); setUserPage(1); }} placeholder="Search email or name" /><button>Search</button></form></header><div className="admin-table"><div className="table-head"><span>User</span><span>Role</span><span>Status</span><span>Wallet</span><span>Last login</span><span>Actions</span></div>{users.map((user) => <div className="table-row" key={user.id}><span><b>{user.display_name}</b><small>{user.email} · {user.email_verified ? "verified" : "unverified"}</small></span><span><select value={user.role} onChange={(event) => void updateUser(user,{ role:event.target.value })}><option>user</option><option>creator</option><option>admin</option></select></span><span><button className={`status ${user.status}`} onClick={() => void updateUser(user,{ status:user.status === "active" ? "suspended" : "active" })}>{user.status}</button></span><span><b>{number(user.available)}</b><small>{number(user.reserved)} held · {number(user.spent)} spent</small></span><span><small>{date(user.last_login_at)}</small></span><span><button onClick={() => void adjustCredits(user)}>Adjust credits</button></span></div>)}</div><div className="admin-pagination"><button disabled={userPage === 1} onClick={() => setUserPage((page) => Math.max(1,page-1))}>← Previous</button><span>Page {userPage}</span><button disabled={users.length < 50} onClick={() => setUserPage((page) => page+1)}>Next →</button></div></section>}
      {tab === "providers" && <section className="provider-grid">{providers.map((provider) => <article className="admin-card" key={provider.provider_key}><span className={`provider-light ${provider.enabled ? "on" : ""}`} /><small>{provider.mode.toUpperCase()} ADAPTER</small><h2>{provider.display_name}</h2><p>{provider.provider_key === "mock" ? "Fully functional deterministic provider for no-cost end-to-end validation." : "Server-only live adapter. Requires encrypted provider secrets and queue consumer."}</p><div><span><b>{provider.enabled ? "Enabled" : "Disabled"}</b><small>Updated {date(provider.updated_at)}</small></span><button onClick={() => void toggleProvider(provider)}>{provider.enabled ? "Disable" : "Enable"}</button></div></article>)}</section>}
      {tab === "audit" && <section className="admin-card audit-card"><header><span><small>APPEND-ONLY OPERATIONS</small><b>Audit logs</b></span></header>{logs.length ? logs.map((log) => <article key={log.id}><span><b>{log.action}</b><small>{log.target_type} · {log.target_id || "system"}</small></span><p>{log.reason || "No reason"}</p><em>{date(log.created_at)}</em></article>) : <p>No admin actions yet.</p>}<div className="admin-pagination"><button disabled={auditPage === 1} onClick={() => setAuditPage((page) => Math.max(1,page-1))}>← Previous</button><span>Page {auditPage}</span><button disabled={logs.length < 50} onClick={() => setAuditPage((page) => page+1)}>Next →</button></div></section>}
    </>}
  </main>;
}
