/* ═══════════════════════════════════════════════════════════════
   PLANS — the "from nothing" / "from what you own" / waypoint engine
   Split out of src/app.js (Phase 2). This is computation over the dataset plus
   the possessions ledger; it owns the persisted plan mode (`dw.planMode`).
   app.js injects the live ledger Set and the id lookup via initPlans().
   ═══════════════════════════════════════════════════════════════ */
const D = window.DW_DATA;

let ctx = { owned: new Set(), nodeById: new Map() };
export function initPlans({ owned, nodeById }) { ctx = { owned, nodeById }; }

// nothing | owned | waypoint (persisted; older builds stored a dw.planUseOwned bool)
export const planState = {
  mode: localStorage.getItem('dw.planMode')
    || (localStorage.getItem('dw.planUseOwned') !== '0' ? 'owned' : 'nothing'),
};

// Cycle nothing → owned → waypoint → nothing, persisting the choice.
export function cyclePlanMode() {
  planState.mode = planState.mode === 'nothing' ? 'owned' : planState.mode === 'owned' ? 'waypoint' : 'nothing';
  localStorage.setItem('dw.planMode', planState.mode);
  return planState.mode;
}

/* ── "From nothing" planner + two-node path query ───────────── */

// Recipes indexed by output, in wiki order (first non-deprecated = primary)
const recipesByOut = (() => {
  const m = new Map();
  for (const r of D.recipes) { if (!m.has(r.output)) m.set(r.output, []); m.get(r.output).push(r); }
  return m;
})();

// Walk the (primary) recipe tree of `id` down to raw materials, multiplying
// quantities. Collects: leaf mats, stations needed, skills (+levels), and — for
// the waypoint checklist — every non-owned item on the remaining tree with its
// craft/gather quantity. When plans start from the ledger (owned/waypoint
// modes), owned items satisfy subtrees: their quantities land in `have` instead
// of `mats`, and subtree expansion stops there.

function walkPlan(id, useOwned) {
  const owned = ctx.owned, nodeById = ctx.nodeById;
  const mats = new Map();       // material name -> qty still needed for one craft
  const have = new Map();       // material name -> qty already owned (owned mode)
  const stations = new Set();   // station names used anywhere up the tree
  const skillLv = new Map();    // skill name -> required level
  const needed = new Map();     // item -> { qty, kind: 'gather'|'craft'|'build', facility?, skill? }
  const inPath = new Set();     // cycle guard

  const primary = x => {
    const rs = recipesByOut.get(x);
    if (!rs || !rs.length) return null;
    return rs.find(r => !r.deprecated) || rs[0];
  };

  const visit = (x, mult) => {
    if (useOwned && owned.has(x)) { have.set(x, (have.get(x) || 0) + mult); return 0; }
    if (inPath.has(x)) { mats.set(x, (mats.get(x) || 0) + mult); return 0; }
    const r = primary(x);
    if (!r) {
      mats.set(x, (mats.get(x) || 0) + mult);
      const n = needed.get(x);
      needed.set(x, { qty: (n ? n.qty : 0) + mult, kind: 'gather' });
      return 0;
    }
    if (r.facility && nodeById.get(r.facility) && nodeById.get(r.facility).kind === 'station') stations.add(r.facility);
    if (r.skill) skillLv.set(r.skill, Math.max(skillLv.get(r.skill) || 1, 1));
    for (const g of (D.skillLevelForItem[x] || [])) skillLv.set(g.skill, Math.max(skillLv.get(g.skill) || 1, g.level || 1));
    inPath.add(x);
    const crafts = Math.max(1, Math.ceil(mult / (r.outputQty || 1)));
    let best = 0;
    for (const i of r.inputs) best = Math.max(best, visit(i.name, crafts * i.qty) + 1);
    inPath.delete(x);
    const n = needed.get(x);
    needed.set(x, { qty: (n ? n.qty : 0) + crafts, kind: 'craft', facility: r.facility || null, skill: r.skill || null });
    return best;
  };

  const depth = visit(id, 1);
  const rootOwned = useOwned && owned.has(id);
  if (rootOwned) needed.delete(id);
  return { mats, have, stations, skillLv, depth, rootOwned, needed, primary };
}

export function planFromNothing(id) {
  const owned = ctx.owned;
  const useOwned = planState.mode !== 'nothing' && owned.size > 0;
  const w = walkPlan(id, useOwned);
  const { mats, have, depth, rootOwned } = w;
  // raw/gatherable root: it would just list itself as its own material — no plan
  // (unless you own it, in which case the plan is "done")
  if (!w.primary(id) && !rootOwned) return null;
  if (!mats.size && !have.size && !rootOwned) return null;
  const allOwned = rootOwned || (!mats.size && have.size > 0);

  // critical chain: follow the input with the longest upstream depth, root -> leaf.
  // With the ledger in play, the chain stops at the first owned anchor (that's where work resumes).
  function subDepth(x, seen) { // memo-free longest depth (primary-recipe trees are small)
    if (seen.has(x)) return 0;
    seen.add(x);
    const r = w.primary(x);
    if (!r) return 0;
    let m = 0;
    for (const i of r.inputs) m = Math.max(m, subDepth(i.name, seen) + 1);
    return m;
  }
  const chain = [];
  let cur = id, guard = 0;
  while (cur && guard++ < 64) {
    chain.push(cur);
    if (useOwned && owned.has(cur)) break; // owned anchor: progress starts here
    const r = w.primary(cur);
    if (!r || !r.inputs.length) break;
    let bestD = -1, bestIn = null;
    for (const i of r.inputs) {
      const d = subDepth(i.name, new Set());
      if (d > bestD) { bestD = d; bestIn = i.name; }
    }
    cur = bestIn;
  }
  return { mats, have, stations: w.stations, skillLv: w.skillLv, chain, depth, allOwned, useOwned };
}

// Waypoint checklist (PF-4): the remaining work as an ordered, checkable list
// from your possessions to the target. Kahn topological order over the needed
// items (inputs before outputs; gathers float to the top), with un-owned
// stations injected as "build" steps ahead of the crafts that use them.
// Per-target progress for the waypoint checklist (persisted): remembers the
// first step count seen for a target and how many check-off/uncheck/re-plan
// cycles happened since. `wpReset(id)` clears it.
export function wpRecord(id) {
  const all = JSON.parse(localStorage.getItem('dw.wpProgress') || '{}');
  if (!all[id]) all[id] = { total: null, done: 0, replans: 0 };
  return all[id];
}
export function wpSave(id, rec) {
  const all = JSON.parse(localStorage.getItem('dw.wpProgress') || '{}');
  all[id] = rec;
  localStorage.setItem('dw.wpProgress', JSON.stringify(all));
}
export function wpReset(id) {
  const all = JSON.parse(localStorage.getItem('dw.wpProgress') || '{}');
  delete all[id];
  localStorage.setItem('dw.wpProgress', JSON.stringify(all));
}

export function planChecklist(id) {
  const owned = ctx.owned, nodeById = ctx.nodeById;
  const useOwned = planState.mode !== 'nothing' && owned.size > 0;
  const w = walkPlan(id, useOwned);
  if (w.rootOwned || !w.primary(id)) return { ...w, steps: [] };
  const need = w.needed;
  for (const [, info] of [...need]) { // inject un-owned stations (materials: see the station's panel)
    if (info.kind !== 'craft' || !info.facility) continue;
    const fNode = nodeById.get(info.facility);
    if (!fNode || fNode.kind !== 'station' || owned.has(info.facility) || need.has(info.facility)) continue;
    need.set(info.facility, { qty: 1, kind: 'build' });
  }
  const kindRank = k => (k === 'gather' ? 0 : 1);
  const outs = new Map();   // prerequisite -> [dependents]
  const indeg = new Map([...need.keys()].map(k => [k, 0]));
  for (const [x, info] of need) {
    if (info.kind !== 'craft') continue;
    const r = w.primary(x);
    for (const i of r.inputs) {
      if (!need.has(i.name) || i.name === x) continue;
      indeg.set(x, indeg.get(x) + 1);
      if (!outs.has(i.name)) outs.set(i.name, []);
      outs.get(i.name).push(x);
    }
    const f = info.facility;
    if (need.has(f) && f !== x) { // station must exist before its first use
      indeg.set(x, indeg.get(x) + 1);
      if (!outs.has(f)) outs.set(f, []);
      outs.get(f).push(x);
    }
  }
  const byKind = (a, b) => kindRank(need.get(a).kind) - kindRank(need.get(b).kind) || a.localeCompare(b);
  const ready = [...need.keys()].filter(k => indeg.get(k) === 0).sort(byKind);
  const order = [];
  while (ready.length) {
    const x = ready.shift();
    order.push(x);
    for (const y of (outs.get(x) || [])) {
      indeg.set(y, indeg.get(y) - 1);
      if (indeg.get(y) === 0) ready.push(y);
    }
    ready.sort(byKind);
  }
  for (const k of [...need.keys()].sort()) if (!order.includes(k)) order.push(k); // cycle fallback
  return { ...w, steps: order.map(name => ({ name, ...need.get(name) })) };
}
