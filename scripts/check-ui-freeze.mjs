import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const frozenUi = Object.freeze({
  "app/admin/admin.css": "435c62a5275347a309ba18421fe9be054611e553",
  "app/admin/page.tsx": "f3a024887790a56367f2f8566bedd781bb690ce9",
  "app/admin/pagination.css": "0faf70634140d468f51c0d72d5b9ac884d3aed4e",
  "app/globals.css": "e3454dde313ae035eb4307901f88d27b0c0b4261",
  "app/layout.tsx": "807697a6a9b80fc05dbff00efaf280a3209d89e6",
  "app/page.tsx": "e784798d635b17d1ffb616b767943c736aac420f",
  "app/reset/page.tsx": "f123791a3f261b11673f784384e3ce870c1da09f",
  "app/share/page.tsx": "f6cacc71d9786c64992ae00643a68b50585f0d89",
  "app/share/share.css": "35836dfa70306e122ad5c0d321752ff03f8ababc",
  "app/studio/page.tsx": "bee8ff3025e133d69b748509449a6b4bbcbb3d85",
  "app/studio/ProCanvas.tsx": "8e2d16ea310156d32ffd8eaf6572594ffeed7443",
  "app/studio/studio.css": "1dfd75e51eeca6f4e6f31e55ce13e76ec52ab259",
  "app/advanced/canvas/page.tsx": "48c75390f10745be3643de02b25843c2d50b63bb",
  "app/library/LibraryShell.tsx": "360f2581f340ca8f315df3b2e9b79cf652ec5181",
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
