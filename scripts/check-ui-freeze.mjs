import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const frozenUi = Object.freeze({
  "app/admin/admin.css": "435c62a5275347a309ba18421fe9be054611e553",
  "app/admin/page.tsx": "f3a024887790a56367f2f8566bedd781bb690ce9",
  "app/admin/pagination.css": "0faf70634140d468f51c0d72d5b9ac884d3aed4e",
  "app/globals.css": "e3454dde313ae035eb4307901f88d27b0c0b4261",
  "app/layout.tsx": "807697a6a9b80fc05dbff00efaf280a3209d89e6",
  "app/page.tsx": "0674f8a0dfe23e69471f98353bf02474b9bb70a1",
  "app/reset/page.tsx": "f123791a3f261b11673f784384e3ce870c1da09f",
  "app/share/page.tsx": "f6cacc71d9786c64992ae00643a68b50585f0d89",
  "app/share/share.css": "35836dfa70306e122ad5c0d321752ff03f8ababc",
  "app/studio/page.tsx": "88be9d36e819d19f584f46d43476b2ee2344920f",
  "app/studio/studio.css": "1dfd75e51eeca6f4e6f31e55ce13e76ec52ab259",
});

const gitBlobHash = (content) => createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
const changed = [];

for (const [path, expected] of Object.entries(frozenUi)) {
  const content = await readFile(new URL(`../${path}`, import.meta.url));
  const actual = gitBlobHash(content);
  if (actual !== expected) changed.push({ path, expected, actual });
}

if (changed.length) {
  console.error("UI freeze violated. Backend-only release cannot continue:");
  for (const item of changed) console.error(`- ${item.path}: expected ${item.expected}, received ${item.actual}`);
  process.exitCode = 1;
} else {
  console.log(`UI freeze verified: ${Object.keys(frozenUi).length} visual source files unchanged.`);
}
