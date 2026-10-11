/* ═══════════════════════════════════════════════════════════════
   In-app data edits (P6-1, P6-2, P6-3) — the localStorage overlay.
   Split out of src/app.js (Phase 2). This module owns the overlay data
   itself (`dw.edits`), the diff against the bundled dataset, and the
   shape of a user relationship edge. The graph/DOM glue that applies
   these edits to cytoscape (addCustomLink/removeCustomLink, the link
   form) stays in app.js.
   ═══════════════════════════════════════════════════════════════ */

// Corrections made in the codex are kept as a small overlay in localStorage
// (key `dw.edits`, app-wide — a data correction is not per-character graph
// state) and applied to the bundled dataset the moment it loads, so every
// derived structure (lookups, degrees, colours, filters) sees the edited
// values. The shipped `public/data.*` files are never touched.
export const EDITS_KEY = 'dw.edits';
// When the shipped dataset catches up with an edit the local copy is noise, and
// when it changes a row underneath one the local copy silently wins over newer
// data. src/cleanup.js offers to drop both after an update; this key remembers
// that it asked for a given dataset (generatedAt) so it does not nag. App-wide,
// like the overlay itself, and deliberately not per character (see
// CONTRIBUTOR.md's `dw.` state conventions — it is data state, not graph state).
export const CLEANUP_KEY = 'dw.cleanup';
// custom relationships the user adds from a node's codex (P6-3): the link goes
// current → target with the chosen relationship
export const LINK_RELS = ['makes', 'gives', 'found-in'];
export const LINK_LABEL = { makes: 'makes', gives: 'gives', 'found-in': 'found in' };

export function loadEdits() {
  try {
    const raw = JSON.parse(localStorage.getItem(EDITS_KEY) || 'null');
    if (raw && typeof raw === 'object' && raw.nodes && typeof raw.nodes === 'object') {
      return {
        nodes: raw.nodes,
        links: Array.isArray(raw.links) ? raw.links : [],
        added: raw.added && typeof raw.added === 'object' ? raw.added : {},
        removed: Array.isArray(raw.removed) ? raw.removed : [],
        // the values the dataset had when each edit was saved (see recordEditBase)
        base: raw.base && typeof raw.base === 'object' ? raw.base : {},
      };
    }
  } catch { /* corrupt storage → clean slate */ }
  return { nodes: {}, links: [], added: {}, removed: [], base: {} };
}

export function persistEdits() {
  try {
    const hasNodes = Object.keys(dataEdits.nodes).length;
    const hasLinks = (dataEdits.links || []).length;
    const hasAdded = Object.keys(dataEdits.added || {}).length;
    const hasRemoved = (dataEdits.removed || []).length;
    if (hasNodes || hasLinks || hasAdded || hasRemoved) localStorage.setItem(EDITS_KEY, JSON.stringify(dataEdits));
    else localStorage.removeItem(EDITS_KEY); // nothing left → drop the key entirely
  } catch { /* storage blocked/full */ }
}

// ids the user created (P6-2) — kept visible even with no links (they are never orphans)
export const addedNodeIds = new Set();

export function emptyNode(id, spec) {
  return {
    id, name: spec.name || id, kind: spec.kind || 'other', itemType: spec.itemType || null,
    icon: null, wiki: spec.wiki || null, description: spec.description || [], stats: spec.stats || {},
    weight: null, stacklimit: null, repaircost: null, catalogue: null, pageid: null,
  };
}

// The editable fields of a node, and the pristine (bundled) values for every
// node the overlay touches — kept so the edits window can show a real diff
// between this browser and the shipped atlas (P6-1b).
export const EDIT_FIELDS = ['name', 'kind', 'itemType', 'wiki', 'description', 'stats'];
export const bundledNodes = new Map(); // id -> bundled field values, captured before any overlay

export function snapshotNodeFields(n) {
  const base = {};
  for (const f of EDIT_FIELDS) base[f] = n[f];
  return base;
}

// overlay the saved node patches onto the live dataset (the id field stays the key)
export function applyEditsToData(data, edits) {
  // hide/remove whole nodes first (P6-2) so patches and links skip them
  const removed = new Set(edits.removed || []);
  if (removed.size) {
    data.nodes = data.nodes.filter(n => !removed.has(n.id));
    data.edges = data.edges.filter(e => !removed.has(e.from) && !removed.has(e.to));
  }
  for (const [id, patch] of Object.entries(edits.nodes || {})) {
    const n = data.nodes.find(x => x.id === id);
    if (!n || !patch || typeof patch !== 'object') continue;
    bundledNodes.set(id, snapshotNodeFields(n));
    Object.assign(n, patch);
  }
  // user-created nodes (P6-2) — always shown, never treated as orphan drops
  for (const [id, spec] of Object.entries(edits.added || {})) {
    if (!id || data.nodes.some(n => n.id === id)) continue;
    data.nodes.push(emptyNode(id, spec || {}));
    addedNodeIds.add(id);
  }
  // custom relationships (P6-3) join the edge list before degrees/filters are built
  for (const l of (edits.links || [])) {
    if (!l || !l.from || !l.to || !LINK_RELS.includes(l.rel)) continue;
    if (!data.nodes.some(n => n.id === l.from) || !data.nodes.some(n => n.id === l.to)) continue;
    data.edges.push({ from: l.from, to: l.to, qty: null, facility: null, skill: null, xp: null, blueprint: null, variant: null, deprecated: false, source: 'user', rel: l.rel });
  }
  return data;
}

// the fields where this browser differs from the bundle ([] = your edit is now
// identical to the shipped data, i.e. it has been merged upstream)
export function editFieldDiff(id) {
  const patch = dataEdits.nodes[id];
  const base = bundledNodes.get(id);
  if (!patch || !base) return { rows: [], merged: false };
  const rows = [];
  for (const f of EDIT_FIELDS) {
    if (patch[f] === undefined) continue;
    if (JSON.stringify(patch[f] ?? null) !== JSON.stringify(base[f] ?? null)) {
      rows.push({ field: f, from: base[f], to: patch[f] });
    }
  }
  return { rows, merged: rows.length === 0 };
}

/* ── post-update cleanup (P6-7) ─────────────────────────────────────
   Two things happen to a local edit when the dataset moves:
     • it becomes **identical** to the shipped value (merged upstream) → the
       local copy is redundant;
     • or the dataset **changed the same field** since the edit was saved → the
       local copy silently overrides fresher data.
   Neither is visible as "wrong" in the atlas, so the app asks about both after
   an update (src/cleanup.js). Detecting the second one needs the value the
   dataset had *at save time*, which is what `base` records. */

// Drop one node's patch AND its recorded baseline (revert / reset / cleanup).
export function dropNodeEdit(id) {
  delete dataEdits.nodes[id];
  if (dataEdits.base) delete dataEdits.base[id];
}

// Remember what the bundled node said when this edit was saved, so a later boot
// can tell that the dataset has moved that field.
export function recordEditBase(id, fields) {
  const bundled = bundledNodes.get(id);
  if (!bundled) return;
  if (!dataEdits.base) dataEdits.base = {};
  if (!dataEdits.base[id]) dataEdits.base[id] = {};
  const rec = dataEdits.base[id];
  for (const f of fields) rec[f] = bundled[f] ?? null;
}

/* Edits saved before the baseline existed have none, so assume the dataset has
   not moved under them yet and adopt today's shipped values as their baseline.
   Without this, a legacy edit could never be reported as overwriting an update. */
export function adoptMissingBases() {
  let adopted = 0;
  for (const [id, patch] of Object.entries(dataEdits.nodes)) {
    if (!patch) continue;
    if (dataEdits.base?.[id]) continue;
    if (!bundledNodes.has(id)) continue;
    recordEditBase(id, EDIT_FIELDS.filter(f => patch[f] !== undefined));
    adopted++;
  }
  if (adopted) persistEdits();
  return adopted;
}

// value comparison as everywhere else in the overlay (null and undefined match)
const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* Classify node patches against the shipped data. Pure — the caller supplies the
   bundled values (id → fields) and the recorded baselines — so this is the part
   the unit tests drive directly. */
export function classifyEdits(nodes, base = {}, bundled = new Map()) {
  const merged = [];
  const moved = [];
  for (const [id, patch] of Object.entries(nodes || {})) {
    const shipped = bundled.get(id);
    if (!patch || !shipped) continue;
    const fields = EDIT_FIELDS.filter(f => patch[f] !== undefined);
    if (!fields.length) continue;
    if (fields.every(f => sameVal(patch[f], shipped[f]))) { merged.push(id); continue; }
    const rec = base[id];
    if (rec && fields.some(f => rec[f] !== undefined && !sameVal(rec[f], shipped[f]))) moved.push(id);
  }
  return { merged, moved };
}

// The two lists the cleanup dialog works from: what is now identical, and what
// still differs because the dataset changed that field (an identical edit is
// step one's business, so it is not repeated in step two).
export function editsCleanup() {
  const { merged, moved } = classifyEdits(dataEdits.nodes, dataEdits.base, bundledNodes);
  const already = new Set(merged);
  return { merged, moved: moved.filter(id => !already.has(id)) };
}

// Drop the listed node edits and their baselines in one write.
export function removeEdits(ids) {
  for (const id of ids) dropNodeEdit(id);
  persistEdits();
}

// the `generatedAt` the cleanup question was last answered for (null = never)
export function cleanupAskedFor() {
  try { return JSON.parse(localStorage.getItem(CLEANUP_KEY) || 'null')?.at ?? null; }
  catch { return null; }
}
export function markCleanupAsked(at) {
  try { localStorage.setItem(CLEANUP_KEY, JSON.stringify({ at })); }
  catch { /* storage blocked/full */ }
}

/* ── custom relationships (P6-3) ─────────────────────────────────── */
export function customEdgeId(from, to, rel) { return `usr:${from}→${to}:${rel}`; }
export function customEdgeElement(e) {
  return {
    group: 'edges',
    data: { id: customEdgeId(e.from, e.to, e.rel), source: e.from, target: e.to, meta: e, rel: e.rel },
    classes: 'customLink',
  };
}

// The live overlay, loaded once at startup.
export const dataEdits = loadEdits();
