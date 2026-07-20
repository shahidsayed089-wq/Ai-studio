import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Miniflare } from "miniflare";

const port = Number(process.env.PORT || 4173);
const root = path.resolve("out");
const origin = `http://127.0.0.1:${port}`;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

const runtime = new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
  scriptPath: "public/_worker.js",
  compatibilityDate: "2026-05-22",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"],
  r2Buckets: ["MEDIA"],
  bindings: {
    AUTH_PEPPER: "e2e-auth-pepper-0123456789abcdef012345",
    SESSION_SIGNING_KEY: "e2e-session-signing-0123456789abcdef01",
    WEBHOOK_SECRET: "e2e-webhook-secret-0123456789abcdef0123",
    ADMIN_EMAIL: "e2e-admin@example.com",
    GOOGLE_CLIENT_ID: "e2e-google-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "e2e-google-client-secret-not-production",
    APP_ENV: "test",
  },
});

const readRequestBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
};

const serveWorker = async (request, response) => {
  const body = ["GET", "HEAD"].includes(request.method || "GET") ? undefined : await readRequestBody(request);
  const upstream = await runtime.dispatchFetch(`${origin}${request.url}`, { method: request.method, headers: request.headers, body, redirect: "manual" });
  response.statusCode = upstream.status;
  for (const [key, value] of upstream.headers) {
    if (key.toLowerCase() !== "set-cookie") response.setHeader(key, value);
  }
  const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  if (setCookies.length) response.setHeader("Set-Cookie", setCookies);
  if (!upstream.body) return response.end();
  Readable.fromWeb(upstream.body).pipe(response);
};

const staticFile = (pathname) => {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return "";
  if (decoded === "/") return path.join(root, "index.html");
  const direct = path.join(root, decoded.replace(/^\/+/, ""));
  if (path.extname(direct)) return direct;
  return `${direct.replace(/\/$/, "")}.html`;
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", origin).pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) return await serveWorker(request, response);
    const file = staticFile(pathname);
    if (!file || !file.startsWith(root) || !existsSync(file) || !(await stat(file)).isFile()) {
      response.statusCode = 404;
      return response.end("Not found");
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", types[path.extname(file).toLowerCase()] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    createReadStream(file).pipe(response);
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : "Test server failure");
  }
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`SHAZAN test server ${origin}\n`));
const shutdown = async () => { server.close(); await runtime.dispose(); };
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
