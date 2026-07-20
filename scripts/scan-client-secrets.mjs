import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || "out");
const extensions = new Set([".html", ".js", ".css", ".json", ".map", ".txt"]);
const files = [];
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(full);
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
};
await visit(root);

const secretValues = Object.entries(process.env)
  .filter(([key, value]) => /(KEY|SECRET|TOKEN|PASSWORD|PEPPER|ACCESS_CODE)/i.test(key) && typeof value === "string" && value.length >= 12)
  .map(([key, value]) => ({ key, value }));
const suspicious = [
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "OpenAI-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "Google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "Stripe-secret", pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  { name: "GitHub-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: "NEXT_PUBLIC-secret-name", pattern: /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|PEPPER)[A-Z0-9_]*/g },
];
const findings = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const { key, value } of secretValues) if (content.includes(value)) findings.push({ file: path.relative(process.cwd(), file), type: "environment-secret-value", key });
  for (const rule of suspicious) if (rule.pattern.test(content)) findings.push({ file: path.relative(process.cwd(), file), type: rule.name });
}
if (findings.length) {
  process.stderr.write(`${JSON.stringify({ ok: false, scanned_files: files.length, findings }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ ok: true, scanned_files: files.length, compared_environment_secrets: secretValues.map(({ key }) => key), findings: [] }, null, 2)}\n`);
