/* ═══════════════════════════════════════════════════════════════
   Layout snapshots + density (Phase 2c).

   The saved-arrangement store, extracted from app.js: the density slider's
   value, the three snapshot tiers — the visitor's own 💾 snapshots in
   localStorage, the shared curated set shipped as public/layouts/curated.js,
   and the bundled manifest from public/layouts/manifest.js — the
   degenerate-snapshot guard, and the save / share actions.

   The app hands this module the few things it can't own itself: the cytoscape
   instance (to read node positions), the toast, the URL-number reader (for the
   ?dens= param) and runLayout (for the post-save reflow). `pendingSave` and
   `lastSpacing` stay in app.js, since they are run-state rather than store
   state — doCustomSave() takes the spacing it should record as an argument.
   ═══════════════════════════════════════════════════════════════ */

let cy = null;
let notify = () => {};
let readUrlNum = (name, stored) => stored;
let rerunLayout = () => {};

// P3-1b: density slider — scales elk layered spacing 50–200%, live re-runs; 💾
// saves the current arrangement per layout+density as a custom snapshot that
// boots instantly. Seeded from ?dens= / localStorage in initLayoutSnapshots.
let densPct = 100;

export function initLayoutSnapshots({ cy: graph, toast, urlNum, runLayout }) {
  cy = graph;
  if (toast) notify = toast;
  if (urlNum) readUrlNum = urlNum;
  if (runLayout) rerunLayout = runLayout;
  densPct = readUrlNum('dens', parseFloat(localStorage.getItem('dw.dens')) || 100);
}

export function getDensPct() { return densPct; }
export function setDensPct(v) { densPct = v; }

const DENS_BASE = {
  'elk-layered': true,
  'elk-layered-wide': true,
};
export function densFactor() { return Math.min(2, Math.max(0.5, (densPct || 100) / 100)); }
export function isElkDenseable(p) { return !!DENS_BASE[p]; }
export function densKey(p) { return p + '@' + densPct; }

let customLayouts = null;
export function loadCustomLayouts() {
  if (customLayouts) return customLayouts;
  try { customLayouts = JSON.parse(localStorage.getItem('dw.customLayouts') || '{}') || {}; } catch { customLayouts = {}; }
  return customLayouts;
}
// a degenerate snapshot (captured mid-layout, or corrupted) must never boot —
// it would collapse the map to a tiny blob or scatter NaNs
export function isSaneSnapshot(map) {
  const ids = Object.keys(map).filter(k => k !== '~meta'); // ~meta is a metadata sibling, not a position
  if (ids.length < 2) return false;
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const id of ids) {
    const p = map[id];
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return false;
    if (p.x < x1) x1 = p.x; if (p.x > x2) x2 = p.x;
    if (p.y < y1) y1 = p.y; if (p.y > y2) y2 = p.y;
  }
  // required spread scales with node count. A flat >400px floor rejected valid
  // SMALL results: an isolated subtree (and the worker result that arranges it)
  // legitimately spans only a few hundred px, so a 15-node layout at 444x224 was
  // treated as degenerate and its worker result was discarded. Full-map
  // snapshots (~2k nodes) keep effectively the same floor, so the mid-flight
  // blob guard is unchanged for them.
  const minExtent = Math.min(400, Math.max(16, Math.sqrt(ids.length) * 20));
  return x2 - x1 > minExtent && y2 - y1 > minExtent;
}
// captures and stores the current arrangement as this visitor's 💾 snapshot
export function doCustomSave(preset, spacing, dens) {
  if (!spacing) { notify('Open an elk layered layout first — snapshots save its arrangement'); return; }
  const map = {};
  for (const n of cy.nodes()) map[n.id()] = { x: Math.round(n.position().x), y: Math.round(n.position().y) };
  const all = loadCustomLayouts();
  // flat id→{x,y} at the key (same shape as the bundled manifest / Desktop-authored
  // snapshots); spacing + timestamp ride along under a sibling ~meta key
  all[`${preset}@${dens}`] = map;
  all[`${preset}@${dens}~meta`] = { spacing, savedAt: Date.now() };
  try { localStorage.setItem('dw.customLayouts', JSON.stringify(all)); } catch { notify('Could not save — browser storage is full'); return; }
  notify(`Arrangement saved for ${preset} @ ${dens}% — it boots instantly from now on`);
  rerunLayout(preset, { reflow: false });
}
let savedLayouts = null;
export function loadSavedLayouts() {
  if (savedLayouts || window.DW_LAYOUTS === undefined) return savedLayouts || null;
  savedLayouts = window.DW_LAYOUTS || {};
  return savedLayouts;
}
// curated snapshots shipped with the site (public/layouts/curated.js, merged by
// scripts/merge-snapshots.mjs) — the layer between a visitor's own 💾
// snapshots and the bundled manifest
let curatedLayouts = null;
export function loadCuratedLayouts() {
  if (curatedLayouts) return curatedLayouts;
  curatedLayouts = window.DW_CURATED || {};
  return curatedLayouts;
}
// ⤓ downloads the current 💾 snapshot as a shareable JSON file
export function shareSnapshot(preset, dens) {
  const cl = loadCustomLayouts();
  const map = cl[`${preset}@${dens}`] || cl[preset];
  if (!map) { notify('Nothing to share yet — save an arrangement with 💾 first'); return; }
  const meta = cl[`${preset}@${dens}~meta`] || cl[`${preset}~meta`] || null;
  const doc = {
    type: 'dw-snapshot',
    version: 1,
    preset,
    dens: cl[`${preset}@${dens}`] ? dens : null,
    exportedAt: new Date().toISOString(),
    meta: meta ? { spacing: meta.spacing || null } : null,
    positions: map,
  };
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dw-snapshot-${preset}${cl[`${preset}@${dens}`] ? '-' + dens : ''}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  notify('Snapshot downloaded — send it in and it can ship with the atlas for everyone');
}
