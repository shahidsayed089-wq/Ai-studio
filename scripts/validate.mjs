import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['functions', 'public/assets'];
const files = [];

function collect(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    const stat = statSync(full);
    if (stat.isDirectory()) collect(full);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(full);
  }
}

for (const root of roots) collect(root);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`\nSyntax failure: ${file}\n${result.stderr || result.stdout}`);
  }
}

if (failed) process.exit(1);
console.log(`AI Studio validation passed: ${files.length} JavaScript files checked.`);
