import { spawnSync } from "node:child_process";

const database = process.env.CLOUDFLARE_D1_DATABASE || "ai-studio-wallet";
const run = (args) => {
  process.stdout.write(`$ npx wrangler ${args.join(" ")}\n`);
  const result = spawnSync("npx", ["wrangler", ...args], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};
run(["whoami"]);
run(["d1", "migrations", "list", database, "--remote"]);
run(["d1", "execute", database, "--remote", "--command", "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('shazan_feature_flags_v1','shazan_job_leases_v1','shazan_job_attempts_v1') ORDER BY name; SELECT flag_key,enabled FROM shazan_feature_flags_v1 ORDER BY flag_key;"]);
run(["queues", "list"]);
run(["d1", "execute", database, "--remote", "--command", "SELECT email,role,status FROM shazan_auth_users_v2 WHERE lower(email) IN ('demo@shazan.ai','admin@shazan.ai'); SELECT provider_key,enabled FROM shazan_providers_v1 WHERE provider_key<>'mock' AND enabled<>0; SELECT flag_key,enabled FROM shazan_feature_flags_v1 WHERE flag_key IN ('ENABLE_LIVE_PAYMENTS','ENABLE_COMMUNITY','ENABLE_FAL','ENABLE_KIE','ENABLE_OPENAI','ENABLE_GOOGLE_AI','ENABLE_XAI','ENABLE_HEYGEN','ENABLE_RUNWAY','ENABLE_MUAPI');"]);
