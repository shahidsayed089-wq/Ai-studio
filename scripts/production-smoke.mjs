const baseUrl = String(process.env.PRODUCTION_BASE_URL || "https://ai-studio-1n1.pages.dev").replace(/\/$/, "");
const expectedOrigin = new URL(baseUrl).origin;
const results = [];
const add = (name, passed, detail, skipped = false) => results.push({ name, passed, skipped, detail });
const request = async (path, init = {}) => fetch(`${baseUrl}${path}`, { redirect: "manual", ...init, headers: { Origin: expectedOrigin, ...(init.headers || {}) } });
const expectStatus = async (name, path, statuses, init) => {
  try { const response = await request(path, init); add(name, statuses.includes(response.status), `HTTP ${response.status}`); return response; }
  catch (error) { add(name, false, String(error?.message || error)); return null; }
};

const health = await expectStatus("public liveness", "/api/health", [200]);
let healthPayload = {};
if (health) { try { healthPayload = await health.json(); } catch { /* recorded below */ } }
add("liveness payload", healthPayload?.core_ready === true, JSON.stringify(healthPayload));
const ready = await expectStatus("production readiness", "/api/health/ready", [200]);
let readyPayload = {};
if (ready) { try { readyPayload = await ready.json(); } catch { /* recorded below */ } }
add("all launch readiness gates", readyPayload?.ready === true && Object.values(readyPayload?.launch_gates || {}).every(Boolean), JSON.stringify(readyPayload?.launch_gates || {}));

if (health) {
  const headers = health.headers;
  add("HSTS", /max-age=\d+/.test(headers.get("strict-transport-security") || ""), headers.get("strict-transport-security"));
  add("CSP", /default-src/.test(headers.get("content-security-policy") || ""), headers.get("content-security-policy"));
  add("request correlation", /^[A-Za-z0-9_.:-]{8,80}$/.test(headers.get("x-request-id") || ""), headers.get("x-request-id"));
}
for (const route of ["/privacy", "/terms", "/acceptable-use", "/dmca", "/refund-policy"]) await expectStatus(`legal route ${route}`, route, [200]);
await expectStatus("unauthenticated projects rejected", "/api/v1/projects", [401]);
await expectStatus("unauthenticated admin rejected", "/api/v1/admin/metrics", [401, 403]);

const first = { email: process.env.PRODUCTION_SMOKE_USER_EMAIL, password: process.env.PRODUCTION_SMOKE_USER_PASSWORD };
const second = { email: process.env.PRODUCTION_SMOKE_SECOND_EMAIL, password: process.env.PRODUCTION_SMOKE_SECOND_PASSWORD };
const login = async (identity, label) => {
  if (!identity.email || !identity.password) { add(`${label} login`, false, "Dedicated production smoke credentials missing", true); return ""; }
  const response = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(identity) });
  add(`${label} login`, response.status === 200, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] || "";
};
const cookieA = await login(first, "primary smoke user");
const cookieB = await login(second, "secondary smoke user");

if (cookieA && cookieB) {
  const authRequest = (path, cookie, init = {}) => request(path, { ...init, headers: { Cookie: cookie, ...(init.headers || {}) } });
  const projectResponse = await authRequest("/api/v1/projects", cookieA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Production smoke ${new Date().toISOString()}` }) });
  const projectPayload = await projectResponse.json().catch(() => ({}));
  add("production project create", projectResponse.status === 201, `HTTP ${projectResponse.status}`);
  const projectId = projectPayload?.project?.id;
  if (projectId) {
    const crossProject = await authRequest(`/api/v1/projects/${projectId}`, cookieB);
    add("production cross-user project isolation", crossProject.status === 404, `HTTP ${crossProject.status}`);
    const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0,0,0,0]);
    const upload = await authRequest("/api/v1/assets", cookieA, { method: "POST", headers: { "Content-Type": "image/png", "Content-Length": String(png.byteLength), "X-File-Name": "production-smoke.png", "X-Project-Id": projectId }, body: png });
    const uploadPayload = await upload.json().catch(() => ({}));
    add("production R2 upload", upload.status === 201, `HTTP ${upload.status}`);
    const assetId = uploadPayload?.asset?.id;
    if (assetId) {
      const ownDownload = await authRequest(`/api/v1/assets/${assetId}/content`, cookieA);
      add("production private R2 download", ownDownload.status === 200 && (await ownDownload.arrayBuffer()).byteLength === png.byteLength, `HTTP ${ownDownload.status}`);
      const crossDownload = await authRequest(`/api/v1/assets/${assetId}/content`, cookieB);
      add("production cross-user R2 isolation", crossDownload.status === 404, `HTTP ${crossDownload.status}`);
      const remove = await authRequest(`/api/v1/assets/${assetId}`, cookieA, { method: "DELETE" });
      add("production R2 deletion", remove.status === 204, `HTTP ${remove.status}`);
      const afterDelete = await authRequest(`/api/v1/assets/${assetId}/content`, cookieA);
      add("production R2 deletion verified", afterDelete.status === 404, `HTTP ${afterDelete.status}`);
    }
    const removeProject = await authRequest(`/api/v1/projects/${projectId}`, cookieA, { method: "DELETE" });
    add("production smoke project cleanup", removeProject.status === 204, `HTTP ${removeProject.status}`);
  }
} else {
  for (const name of ["production project create", "production cross-user project isolation", "production R2 upload", "production private R2 download", "production cross-user R2 isolation", "production R2 deletion"]) add(name, false, "Skipped because two dedicated smoke accounts were not configured", true);
}

const summary = { url: baseUrl, timestamp: new Date().toISOString(), passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed && !item.skipped).length, skipped: results.filter((item) => item.skipped).length, results };
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.failed || summary.skipped) process.exitCode = 1;
