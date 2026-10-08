/* Pure logic for baking browser-exported data edits into the dataset
   (PLAN §3 P6-5). Kept apart from the CLI so the merge can be unit-tested
   without touching the repo's files. The field list mirrors EDIT_FIELDS in
   site/app.js — keep them in step. */

export const EDIT_FIELDS = ['name', 'kind', 'itemType', 'wiki', 'description', 'stats'];

// Merge an edits-overlay export ({ nodes: { id: { field: value } } }) onto a
// dataset, field by field. Returns { changed, missed }: changed counts nodes
// whose value actually differed, missed lists ids not present in the dataset.
export function mergeEditsOverlay(dataset, edits) {
  const patchNodes = edits?.nodes || {};
  const byId = new Map(dataset.nodes.map(n => [n.id, n]));
  let changed = 0;
  const missed = [];
  for (const [id, patch] of Object.entries(patchNodes)) {
    const n = byId.get(id);
    if (!n) { missed.push(id); continue; }
    let touched = false;
    for (const f of EDIT_FIELDS) {
      if (patch[f] === undefined) continue;
      if (JSON.stringify(n[f] ?? null) !== JSON.stringify(patch[f] ?? null)) {
        n[f] = patch[f];
        touched = true;
      }
    }
    if (touched) changed++;
  }
  return { changed, missed };
}

// Validate a full-dataset export: unique non-empty string ids; report any edge
// that references an unknown node. Returns { ok, error?, ids?, dangling? }.
export function validateDatasetExport(d) {
  if (!d || !Array.isArray(d.nodes) || !d.nodes.length) return { ok: false, error: 'dataset export has no nodes[]' };
  const ids = new Set();
  for (const n of d.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) return { ok: false, error: 'every node needs a string id' };
    if (ids.has(n.id)) return { ok: false, error: `duplicate node id: ${n.id}` };
    ids.add(n.id);
  }
  const dangling = (d.edges || []).filter(e => !ids.has(e.from) || !ids.has(e.to));
  return { ok: true, ids, dangling };
}

// Replace a dataset's graph-bearing sections from a full-dataset export.
export function applyDatasetExport(dataset, exported) {
  dataset.nodes = exported.nodes;
  for (const k of ['edges', 'recipes', 'spells', 'skills', 'skillLevelForItem']) {
    if (exported[k] !== undefined) dataset[k] = exported[k];
  }
  return dataset;
}
