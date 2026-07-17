// Writes dist/esm/package.json and dist/cjs/package.json so Node's native ESM/CJS
// resolvers know how to parse the .js files in each folder without relying on the
// root package.json's (absent) "type" field. Without these markers, Node treats
// dist/esm/*.js as CommonJS by default and throws a SyntaxError on `export`/`import`.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const targets = [
  { dir: join(root, "dist", "esm"), type: "module" },
  { dir: join(root, "dist", "cjs"), type: "commonjs" },
];

for (const { dir, type } of targets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type }, null, 2) + "\n");
  console.log(`wrote ${join(dir, "package.json")} ({ "type": "${type}" })`);
}
