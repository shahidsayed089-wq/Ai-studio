import { readFile } from "node:fs/promises";

const extractRows = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rows = extractRows(item);
      if (rows.length) return rows;
    }
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value.results)) return value.results;
    for (const item of Object.values(value)) {
      const rows = extractRows(item);
      if (rows.length) return rows;
    }
  }
  return [];
};

const loadCounts = async (file) => {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const rows = extractRows(parsed);
  return Object.fromEntries(rows.map((row) => [String(row.entity), Number(row.value)]));
};

const production = await loadCounts(process.argv[2]);
const restored = await loadCounts(process.argv[3]);
const entities = ["users", "projects", "jobs", "assets", "ledger"];
const differences = entities.filter((entity) => !Number.isFinite(production[entity]) || production[entity] !== restored[entity]);
const result = { production, restored, differences, matched: differences.length === 0 };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (differences.length) process.exit(1);
