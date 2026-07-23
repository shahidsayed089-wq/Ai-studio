import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(root, "node_modules", "playwright", "cli.js");
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(tmpdir(), "shazan-playwright");
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath };

const run = (args) => spawnSync(process.execPath, [cli, ...args], {
  cwd: root,
  env,
  stdio: "inherit",
});

const installation = run(["install", "chromium"]);
if (installation.status !== 0) process.exit(installation.status ?? 1);

const tests = run(["test", ...process.argv.slice(2)]);
process.exit(tests.status ?? 1);
