/* Reading and writing the tracked dataset.
   public/data.json and public/data.js are one dataset in two serializations and
   CONTRIBUTOR-DATA.md's rule is that they are only ever written together, by
   one script — so every writer goes through here instead of re-deriving the
   shape. cache/final-dataset.json is the pipeline's gitignored working copy:
   build-data.mjs writes it, the apply scripts merge onto it.

   Kept separate from apply-edits-core.mjs, which is pure (no fs) so it can be
   unit-tested. */
import fs from "node:fs";

const rootUrl = (p) => new URL(`../${p}`, import.meta.url);

export const PATHS = {
  cache: rootUrl("cache/final-dataset.json").pathname,
  cacheDir: rootUrl("cache/").pathname,
  json: rootUrl("public/data.json").pathname,
  js: rootUrl("public/data.js").pathname,
};

// the serialization build-data.mjs uses — one indent level for the JSON files
export const datasetJson = (dataset) => JSON.stringify(dataset, null, 1);
export const datasetJs = (dataset) => `window.DW_DATA = ${JSON.stringify(dataset)};`;

export function readWorkingDataset() {
  return JSON.parse(fs.readFileSync(PATHS.cache, "utf8"));
}

/* A fresh clone has no cache/ (it is gitignored), so the working copy is seeded
   from the tracked dataset. Returns true when it had to create one. */
export function ensureWorkingCopy({ log = () => {} } = {}) {
  if (fs.existsSync(PATHS.cache)) return false;
  fs.mkdirSync(PATHS.cacheDir, { recursive: true });
  fs.copyFileSync(PATHS.json, PATHS.cache);
  log("seeded cache/final-dataset.json from public/data.json");
  return true;
}

// Write the working copy back out plus both tracked dataset files, in lockstep.
export function writeDatasetFiles(dataset) {
  fs.writeFileSync(PATHS.cache, datasetJson(dataset));
  fs.writeFileSync(PATHS.json, datasetJson(dataset));
  fs.writeFileSync(PATHS.js, datasetJs(dataset));
  return [PATHS.json, PATHS.js];
}
