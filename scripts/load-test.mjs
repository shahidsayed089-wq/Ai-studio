const baseUrl = String(process.env.PRODUCTION_BASE_URL || "https://ai-studio-1n1.pages.dev").replace(/\/$/, "");
const requestsPerRoute = Math.min(500, Math.max(5, Number(process.env.LOAD_REQUESTS || 25)));
const concurrency = Math.min(20, Math.max(1, Number(process.env.LOAD_CONCURRENCY || 5)));
const routes = [{ name: "health", method: "GET", path: "/api/health", expected: [200] }];
let cookie = "";
if (process.env.PRODUCTION_SMOKE_USER_EMAIL && process.env.PRODUCTION_SMOKE_USER_PASSWORD) {
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { Origin: baseUrl, "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.PRODUCTION_SMOKE_USER_EMAIL, password: process.env.PRODUCTION_SMOKE_USER_PASSWORD }) });
  if (login.status !== 200) throw new Error(`Load-test login failed with HTTP ${login.status}`);
  cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  routes.push(
    { name: "login", method: "POST", path: "/api/auth/login", expected: [200], body: { email: process.env.PRODUCTION_SMOKE_USER_EMAIL, password: process.env.PRODUCTION_SMOKE_USER_PASSWORD } },
    { name: "projects", method: "GET", path: "/api/v1/projects?limit=10", expected: [200] },
    { name: "jobs", method: "GET", path: "/api/v1/jobs?limit=10", expected: [200] },
    { name: "credits", method: "GET", path: "/api/v1/credits?limit=10", expected: [200] },
    { name: "assets", method: "GET", path: "/api/v1/assets?limit=10", expected: [200] },
  );
  if (process.env.LOAD_JOB_ID) routes.push({ name: "sse", method: "GET", path: `/api/v1/jobs/${encodeURIComponent(process.env.LOAD_JOB_ID)}/events`, expected: [200] });
}
const percentile = (values, value) => values[Math.min(values.length - 1, Math.ceil(values.length * value) - 1)] || 0;
const runRoute = async (route) => {
  const durations = [];
  let errors = 0;
  let index = 0;
  const worker = async () => {
    while (index < requestsPerRoute) {
      index += 1;
      const started = performance.now();
      try {
        const response = await fetch(`${baseUrl}${route.path}`, { method: route.method, headers: { Origin: baseUrl, ...(cookie ? { Cookie: cookie } : {}), ...(route.body ? { "Content-Type": "application/json" } : {}) }, body: route.body ? JSON.stringify(route.body) : undefined });
        if (!route.expected.includes(response.status)) errors += 1;
        if (route.name === "sse") await response.body?.cancel(); else await response.arrayBuffer();
      } catch { errors += 1; }
      durations.push(performance.now() - started);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  durations.sort((a, b) => a - b);
  return { route: route.name, requests: durations.length, concurrency, errors, p50_ms: Math.round(percentile(durations, .5)), p95_ms: Math.round(percentile(durations, .95)), p99_ms: Math.round(percentile(durations, .99)), max_ms: Math.round(durations.at(-1) || 0) };
};
const results = [];
for (const route of routes) results.push(await runRoute(route));
const required = ["login", "projects", "jobs", "credits", "assets", "sse"];
const missing = required.filter((name) => !results.some((item) => item.route === name));
const summary = { url: baseUrl, timestamp: new Date().toISOString(), authenticated: Boolean(cookie), results, missing_required_routes: missing, ok: results.every((item) => item.errors === 0) && missing.length === 0 };
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!summary.ok) process.exitCode = 1;
