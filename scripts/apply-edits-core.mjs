/* Pure logic for baking browser-exported data edits into the dataset
   (PLAN §3 P6-5). Kept apart from the CLI so the merge can be unit-tested
   without touching the repo's files. The field list mirrors EDIT_FIELDS in
   site/app.js — keep them in step. */

export const EDIT_FIELDS = ['name', 'kind', 'itemType', 'wiki', 'description', 'stats'];

// user-added relationships (P6-3): the link goes from → to with this relationship
export const LINK_RELS = ['makes', 'gives', 'found-in'];
export const linkEdge = (l) => ({
  from: l.from, to: l.to, qty: null, facility: null, skill: null, xp: null,
  blueprint: null, variant: null, deprecated: false, source: 'user', rel: l.rel,
});

// a user-created node (P6-2), shaped like the bundled ones
export const makeNode = (id, spec = {}) => ({
  id, name: spec.name || id, kind: spec.kind || 'other', itemType: spec.itemType || null,
  icon: null, wiki: spec.wiki || null, description: spec.description || [], stats: spec.stats || {},
  weight: null, stacklimit: null, repaircost: null, catalogue: null, pageid: null,
});

// Merge an edits-overlay export onto a dataset, field by field, plus the
// whole-node edits (removed ids, added nodes) and the custom links. Returns
// counts + anything skipped. Mutates `dataset` in place.
export function mergeEditsOverlay(dataset, edits) {
  dataset.edges = dataset.edges || [];

  // hide/remove whole nodes first so patches and links skip them (P6-2)
  const removedList = Array.isArray(edits?.removed) ? edits.removed : [];
  let removedCount = 0;
  if (removedList.length) {
    const gone = new Set(removedList);
    const before = dataset.nodes.length;
    dataset.nodes = dataset.nodes.filter(n => !gone.has(n.id));
    dataset.edges = dataset.edges.filter(e => !gone.has(e.from) && !gone.has(e.to));
    removedCount = before - dataset.nodes.length;
  }

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

  // user-created nodes (P6-2)
  let addedCount = 0;
  for (const [id, spec] of Object.entries(edits?.added || {})) {
    if (!id || dataset.nodes.some(n => n.id === id)) continue;
    dataset.nodes.push(makeNode(id, spec || {}));
    addedCount++;
  }

  // custom relationships (P6-3) become edges on the dataset
  const ids = new Set(dataset.nodes.map(n => n.id));
  const edges = dataset.edges;
  let linksAdded = 0;
  const missedLinks = [];
  for (const l of (edits?.links || [])) {
    if (!l || !l.from || !l.to || !LINK_RELS.includes(l.rel)) { missedLinks.push(`${l?.from}→${l?.to}`); continue; }
    if (!ids.has(l.from) || !ids.has(l.to)) { missedLinks.push(`${l.from}→${l.to}`); continue; }
    if (edges.some(e => e.from === l.from && e.to === l.to && e.rel === l.rel)) continue;
    edges.push(linkEdge(l));
    linksAdded++;
  }
  return { changed, missed, linksAdded, missedLinks, addedCount, removedCount };
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
