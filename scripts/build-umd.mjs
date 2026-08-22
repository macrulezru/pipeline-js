// Bundles the already-built dist/esm/index.js (core module only — no Vue/React)
// into a single self-contained IIFE for CDN `<script>` tag usage, exposing a
// `window.RestPipeline` global. axios is bundled in (it's already a regular
// dependency, not a peer) so the CDN build works with just one script tag —
// no separate axios include required. Run after `npm run build`, since it
// bundles from dist/esm, not src, to reuse the exact same compiled output
// (and its already-resolved relative imports) that ships via npm/ESM/CJS.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const entry = join(root, "dist", "esm", "index.js");
const outDir = join(root, "dist", "umd");

const shared = {
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  globalName: "RestPipeline",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
};

await build({
  ...shared,
  outfile: join(outDir, "rest-pipeline.umd.js"),
  minify: false,
  sourcemap: true,
});
console.log(`wrote ${join(outDir, "rest-pipeline.umd.js")}`);

await build({
  ...shared,
  outfile: join(outDir, "rest-pipeline.umd.min.js"),
  minify: true,
  sourcemap: true,
});
console.log(`wrote ${join(outDir, "rest-pipeline.umd.min.js")}`);
