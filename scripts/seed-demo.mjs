import { pbkdf2Sync, randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const required = ["AUTH_PEPPER", "DEMO_USER_PASSWORD", "DEMO_ADMIN_PASSWORD"];
for (const key of required) if (!process.env[key] || process.env[key].length < 12) throw new Error(`${key} is required; passwords must be 12+ characters and AUTH_PEPPER must match production.`);
if (process.env.AUTH_PEPPER.length < 32) throw new Error("AUTH_PEPPER must be at least 32 characters.");

const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hashPassword = (password) => {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(`${password}\0${process.env.AUTH_PEPPER}`, salt, 30000, 32, "sha256").toString("base64url");
  return { salt, passwordHash: `pbkdf2_sha256$30000$${digest}` };
};
const now = Math.floor(Date.now() / 1000);
const userEmail = (process.env.DEMO_USER_EMAIL || "demo@shazan.ai").toLowerCase();
const adminEmail = (process.env.DEMO_ADMIN_EMAIL || "admin@shazan.ai").toLowerCase();
const demo = { id: randomUUID(), email: userEmail, name: "SHAZAN Demo Creator", ...hashPassword(process.env.DEMO_USER_PASSWORD), role: "user" };
const admin = { id: randomUUID(), email: adminEmail, name: "SHAZAN Launch Admin", ...hashPassword(process.env.DEMO_ADMIN_PASSWORD), role: "admin" };
const workflow = { nodes:[{id:"prompt-1",type:"text_prompt",position:{x:80,y:160},data:{prompt:"A cinematic world at golden hour"}},{id:"image-1",type:"image_generator",position:{x:360,y:160},data:{model:"mock-v1"}},{id:"video-1",type:"image_to_video",position:{x:640,y:160},data:{model:"mock-v1"}},{id:"upscale-1",type:"video_upscaler",position:{x:920,y:160},data:{model:"mock-v1"}},{id:"export-1",type:"download_export",position:{x:1200,y:160},data:{format:"json"}}],edges:[{id:"edge-1",source:"prompt-1",target:"image-1",kind:"text"},{id:"edge-2",source:"image-1",target:"video-1",kind:"image"},{id:"edge-3",source:"video-1",target:"upscale-1",kind:"video"},{id:"edge-4",source:"upscale-1",target:"export-1",kind:"video"}] };
workflow.nodes.sort((a,b)=>a.id.localeCompare(b.id)); workflow.edges.sort((a,b)=>a.id.localeCompare(b.id));
const workflowJson = JSON.stringify(workflow);
const workflowHash = createHash("sha256").update(workflowJson).digest("base64url");
const projectId = "demo-launch-workflow-v1";

const userStatements = (account) => `
INSERT OR IGNORE INTO shazan_auth_users_v2(id,email,display_name,password_hash,password_salt,role,status,credits,email_verified,created_at,updated_at)
VALUES(${sql(account.id)},${sql(account.email)},${sql(account.name)},${sql(account.passwordHash)},${sql(account.salt)},${sql(account.role)},'active',500,1,${now},${now});
INSERT INTO shazan_user_profiles_v1(user_id,role,created_at,updated_at) SELECT id,${sql(account.role)},${now},${now} FROM shazan_auth_users_v2 WHERE email=${sql(account.email)} ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at;
INSERT OR IGNORE INTO shazan_credit_wallets_v1(user_id,available,reserved,spent,updated_at) SELECT id,500,0,0,${now} FROM shazan_auth_users_v2 WHERE email=${sql(account.email)};
INSERT OR IGNORE INTO shazan_credit_ledger_v1(id,user_id,event_key,entry_type,available_delta,reserved_delta,spent_delta,reason,created_at) SELECT lower(hex(randomblob(16))),id,${sql(`seed:${account.email}`)},'grant',500,0,0,'Demo seed credits',${now} FROM shazan_auth_users_v2 WHERE email=${sql(account.email)};
`;

const statements = `PRAGMA foreign_keys=ON;
${userStatements(demo)}
${userStatements(admin)}
INSERT OR IGNORE INTO shazan_projects_v1(id,owner_id,name,description,workflow_json,workflow_hash,current_version,created_at,updated_at)
SELECT ${sql(projectId)},id,'Launch Demo Workflow','Prompt to image to video to upscaler to durable export.',${sql(workflowJson)},${sql(workflowHash)},1,${now},${now} FROM shazan_auth_users_v2 WHERE email=${sql(demo.email)};
INSERT OR IGNORE INTO shazan_project_versions_v1(id,project_id,version_number,workflow_json,workflow_hash,reason,created_by,created_at)
SELECT lower(hex(randomblob(16))),${sql(projectId)},1,${sql(workflowJson)},${sql(workflowHash)},'Demo database seed',owner_id,${now} FROM shazan_projects_v1 WHERE id=${sql(projectId)};
`;

const directory = mkdtempSync(path.join(tmpdir(), "shazan-seed-"));
const file = path.join(directory, "seed.sql");
writeFileSync(file, statements, { mode: 0o600 });
const args = ["wrangler", "d1", "execute", "ai-studio-wallet", process.argv.includes("--remote") ? "--remote" : "--local", "--file", file];
const result = spawnSync("npx", args, { stdio: "inherit", env: process.env });
if (result.status !== 0) process.exit(result.status || 1);
process.stdout.write(`Seed complete: ${demo.email}, ${admin.email}, project ${projectId}. Passwords were read from environment and never written to the repository.\n`);
