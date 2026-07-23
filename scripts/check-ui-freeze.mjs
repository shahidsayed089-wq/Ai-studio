import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const frozenUi = Object.freeze({
  "app/admin/admin.css": "435c62a5275347a309ba18421fe9be054611e553",
  "app/admin/page.tsx": "f3a024887790a56367f2f8566bedd781bb690ce9",
  "app/admin/pagination.css": "0faf70634140d468f51c0d72d5b9ac884d3aed4e",
  "app/globals.css": "e3454dde313ae035eb4307901f88d27b0c0b4261",
  "app/layout.tsx": "807697a6a9b80fc05dbff00efaf280a3209d89e6",
  "app/page.tsx": "dc33d4dda3d1a5cec392f3d82ea02b202c7896d0",
  "app/reset/page.tsx": "f123791a3f261b11673f784384e3ce870c1da09f",
  "app/share/page.tsx": "f6cacc71d9786c64992ae00643a68b50585f0d89",
  "app/share/share.css": "35836dfa70306e122ad5c0d321752ff03f8ababc",
  "app/studio/page.tsx": "bee8ff3025e133d69b748509449a6b4bbcbb3d85",
  "app/studio/ProCanvas.tsx": "f4af0b888ed8b5015e4fead6f74eb7079745b5ff",
  "app/studio/studio.css": "1dfd75e51eeca6f4e6f31e55ce13e76ec52ab259",
  "app/advanced/canvas/page.tsx": "48c75390f10745be3643de02b25843c2d50b63bb",
  "app/library/LibraryShell.tsx": "fc3e64fa0f54716a1282f55f6a0dd1b887670028",
  "app/library/library.css": "d6276f3298cd9b7902621797fb2a540b535d3d44",
  "app/projects/page.tsx": "c88c867969ec7a31c0d729f1c5cb0c0e3f44555c",
  "app/assets/page.tsx": "1b262d3901838646f883472fad9cc48d192840ac",
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
