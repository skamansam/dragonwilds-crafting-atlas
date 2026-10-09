/* ═══════════════════════════════════════════════════════════════
   HIGHLIGHT — progressive Requires / Enables expansion
   Split out of src/app.js (Phase 2c).

   This subsystem is the one piece of the app that both READS and WRITES the
   shared view state: it anchors on a node, walks D.edges one recipe level per
   click, and — when it supersedes an isolation — owns node visibility by
   toggling the .hidden / .faded / .highlighted classes. It therefore talks to
   the rest of app.js through an injected context (getters/setters for the
   `isolatedRoot` / `showOrphans` lets, plus the filter + readout callbacks),
   rather than importing app-assembly internals.

   app.js creates cy, the id map and the filter helpers; initHighlight() hands
   them over at boot, next to initPlans().
   ═══════════════════════════════════════════════════════════════ */
const D = window.DW_DATA;

let ctx = {
  cy: null,
  nodeById: new Map(),
  kindLabel: {},
  activeCats: new Set(),
  getIsolatedRoot: () => null,
  setIsolatedRoot: () => {},
  getShowOrphans: () => false,
  setShowOrphans: () => {},
  lgSyncKind: () => {},
  applyCategoryVisibility: () => {},
  updateReadout: () => {},
  fitSoon: () => {},
  toast: () => {},
};
export function initHighlight(c) { ctx = c; }

/* ── P21/P22: progressive requires/enables — the buttons GROW the visible tree ── */
// Old behaviour highlighted a full upstream/downstream closure; after an
// isolation every highlighted node was hidden, so the buttons looked dead
// (PLAN #21). New behaviour: the highlighted set SUPERSEDES visibility — it is
// revealed (hidden removed), and each further click expands the visible tree
// by ONE recipe level from its frontier (PLAN #22, user-confirmed):
//   Enables (down) → what the shown nodes go on to make (Bread → its sandwiches…)
//   Requires (up)  → what the shown nodes are made from
// State anchors on the clicked node and survives selection changes while the
// direction stays the same; picking a node outside the highlighted set re-anchors.
let highlightRoot = null;        // node the highlight was anchored on
let highlightDir = null;         // 'down' (enables) | 'up' (requires)
let highlightLevels = new Map(); // id → depth from the anchor (0 = anchor)
let highlightDepth = 0;          // levels revealed so far
let highlightGrewFromIso = false; // whether the highlight superseded an isolation (visual mode)
let highlightId = null;
export function highlightActive() { return highlightId !== null; }
// a highlight is anchored on a node (the tap guard reads this)
export function hasHighlight() { return highlightRoot !== null; }
export function resetHighlightState() {
  highlightRoot = null; highlightDir = null; highlightLevels = new Map(); highlightDepth = 0;
  highlightGrewFromIso = false;
}
// an isolation ended: drop the highlight AND the "active" marker the hover
// guard reads, so hovering works again once the map is whole
export function forgetHighlight() {
  highlightId = null;
  resetHighlightState();
}
function expandHighlight(id, dir) {
  // re-anchor unless an active highlight of the same direction already contains id
  let reAnchored = false;
  if (highlightDir !== dir || highlightRoot === null || !highlightLevels.has(id)) {
    highlightRoot = id; highlightDir = dir;
    highlightLevels = new Map([[id, 0]]);
    highlightDepth = 0;
    reAnchored = true;
  }
  // collect the next level: neighbours of the NEWEST frontier only.
  // Skill-gate spokes (skill → everything it unlocks, same D.edges list as
  // recipe edges) must not join the walk: a Requires walk would otherwise
  // explode into a skill's ~200 unlock edges instead of recipe ingredients.
  const next = [];
  for (const [nid, d] of highlightLevels) {
    if (d !== highlightDepth) continue;
    for (const e of D.edges) {
      const nb = dir === 'down' ? (e.from === nid ? e.to : null)
                                : (e.to === nid ? e.from : null);
      if (nb === null || highlightLevels.has(nb)) continue;
      const src = dir === 'down' ? nid : nb; // the edge's ingredient side
      if (ctx.nodeById.get(src)?.kind === 'skill') continue;
      // Facility-aware frontier (TODO #23): for upstream Requires walks the recipe's
      // crafting station is a prerequisite at the same depth — collect it when the
      // facility resolves to a station/tool node and isn't already highlighted. Downstream
      // (Enables) walks exclude facilities: e.facility is where the current item was
      // crafted, not where its products go on to be made (PLAN #23).
      if (dir === 'up' && e.facility && !highlightLevels.has(e.facility)) {
        const fnode = ctx.nodeById.get(e.facility);
        if (fnode && (fnode.kind === 'station' || fnode.kind === 'tool')) {
          highlightLevels.set(e.facility, d + 1); next.push(e.facility);
        }
      }
      highlightLevels.set(nb, d + 1); next.push(nb);
    }
  }
  if (!next.length) {
    const other = dir === 'down' ? 'Requires' : 'Enables';
    ctx.toast(dir === 'down'
      ? `Nothing further downstream — everything ${ctx.nodeById.get(id).name} leads to is shown. Use ${other} to expand what these are made from.`
      : `Nothing further upstream — every ingredient of ${ctx.nodeById.get(id).name} is shown. Use ${other} to expand what they make.`);
    return;
  }
  highlightDepth++;
  highlightId = id;
  // P21: a requires/enables highlight supersedes the current view — from an isolation it GROWS the
  // visible tree (P22: what was shown stays shown, the new level joins it);
  // from the full map it keeps the classic highlight look (fade + highlighted)
  // while revealing kind-hidden highlighted nodes. Either way an active isolation
  // ends here — the highlight is the new visible context.
  // Re-anchoring: grewFromIso is true if this click started fresh from an
  // isolation. Continuing an existing highlight preserves the original value so
  // stepBackHighlight() knows it was grown-from-iso (hide, not fade) on every level.
  const grewFromIso = reAnchored ? ctx.getIsolatedRoot() !== null : highlightGrewFromIso;
  highlightGrewFromIso = grewFromIso;
  // hidden set BEFORE this click — every branch preserves it: the blanket
  // class strip must not leak the previous view's hidden nodes into view
  // (2nd click from a grown tree otherwise unhides the whole map)
  const preHiddenIds = new Set(ctx.cy.nodes('.hidden').map(n => n.id()));
  ctx.setIsolatedRoot(null);
  document.getElementById('breadcrumb').classList.add('hidden');
  const frontierSet = new Set(next);
  ctx.cy.batch(() => {
    if (grewFromIso) {
      // auto-reveal every kind so the grown tree supersedes the filters — the
      // same courtesy isolateTree extends to the isolation
      for (const k of Object.keys(ctx.kindLabel)) { ctx.activeCats.add(k); ctx.lgSyncKind(k); }
      document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.add('on'));
      ctx.setShowOrphans(false);
      document.getElementById('orphansChip').classList.remove('on');
    }
    ctx.cy.nodes().forEach(n => {
      const nid = n.id();
      n.removeClass('hidden faded highlighted');
      if (!highlightLevels.has(nid)) {
        if (preHiddenIds.has(nid)) n.addClass('hidden'); // stay hidden as before
        if (!grewFromIso && !preHiddenIds.has(nid)) n.addClass('faded'); // classic highlight look
      } else if (frontierSet.has(nid)) {
        n.addClass('highlighted'); // gold = new this click
      }
    });
    ctx.cy.getElementById(id).addClass('sel');
    ctx.cy.edges().forEach(e => {
      const s = highlightLevels.get(e.source().id()), t = highlightLevels.get(e.target().id());
      // on-path edges connect consecutive levels in the walked direction
      const onPath = s !== undefined && t !== undefined && Math.abs(s - t) === 1;
      if (onPath) { e.removeClass('hidden faded').addClass('highlighted'); return; }
      e.removeClass('highlighted faded');
      const bothInHighlight = s !== undefined && t !== undefined;
      if (!grewFromIso) {
        // classic highlight look: the highlighted closure un-fades, everything else fades
        if (!bothInHighlight) e.addClass('faded');
      } else if (!bothInHighlight) {
        e.addClass('hidden'); // grow mode: edges leaving the highlighted set stay out
      }
    });
  });
  if (reAnchored && grewFromIso) setTimeout(() => ctx.cy.fit(undefined, 70), 60);
  ctx.updateReadout();
  const dirLabel = dir === 'down' ? 'enables' : 'requires';
  ctx.toast(`${ctx.nodeById.get(id).name} · ${dirLabel} level ${highlightDepth}: +${next.length} nodes · ${highlightLevels.size - 1} total shown — click again to expand further`);
  saveHighlight();
}

export function showRequires(id) { expandHighlight(id, 'up'); }

// Enables (P4-2): everything this item feeds into — progressive
export function showEnables(id) { expandHighlight(id, 'down'); }

export function clearHighlight() {
  highlightId = null;
  const hadHighlight = highlightRoot !== null;
  resetHighlightState();
  ctx.cy.elements().removeClass('faded highlighted');
  saveHighlight(); // removes the stored key since highlightRoot is now null
  // P22: the highlight now controls visibility (it supersedes isolation), so clearing
  // it must restore the full map — otherwise highlighted-away nodes stay hidden
  if (hadHighlight) {
    ctx.cy.batch(() => {
      ctx.cy.nodes().removeClass('hidden').style({ opacity: '' });
      ctx.cy.edges().removeClass('hidden').style({ opacity: '' });
      ctx.applyCategoryVisibility();
    });
    ctx.fitSoon();
  }
}

/* ── P23: stepBackHighlight — collapse the deepest level ───────────── */
// Mirrors the unit-tested stepBackHighlight math: drop the deepest level from
// highlightLevels, decrement highlightDepth. Visually the removed frontier goes back
// to hidden (grow-from-iso mode) or faded (classic highlight mode); the new
// frontier (depth === highlightDepth) gets the .highlighted gold highlight. When
// highlightDepth reaches 0 — only the anchor remains — clearHighlight() restores the
// full map.
export function stepBackHighlight() {
  if (highlightRoot === null) return;
  if (highlightDepth === 0) {
    clearHighlight();
    return;
  }
  // collect + drop the deepest level
  const removed = [];
  for (const [nid, d] of highlightLevels) {
    if (d === highlightDepth) { highlightLevels.delete(nid); removed.push(nid); }
  }
  const removedSet = new Set(removed);
  highlightDepth--;
  highlightId = highlightRoot;
  // new frontier = nodes at the new highlightDepth
  const frontierSet = new Set(
    [...highlightLevels.entries()].filter(([_, d]) => d === highlightDepth).map(([id]) => id)
  );
  // currently hidden (category-hidden or hidden-by-highlighted) — keep them hidden
  const preHiddenIds = new Set(ctx.cy.nodes('.hidden').map(n => n.id()));
  ctx.cy.batch(() => {
    ctx.cy.nodes().forEach(n => {
      const nid = n.id();
      n.removeClass('hidden faded highlighted');
      if (!highlightLevels.has(nid)) {
        if (highlightGrewFromIso || preHiddenIds.has(nid)) n.addClass('hidden');
        else n.addClass('faded');
      } else if (frontierSet.has(nid)) {
        n.addClass('highlighted');
      }
      if (nid === highlightRoot) n.addClass('sel');
    });
    ctx.cy.edges().forEach(e => {
      const s = highlightLevels.get(e.source().id()), t = highlightLevels.get(e.target().id());
      const onPath = s !== undefined && t !== undefined && Math.abs(s - t) === 1;
      if (onPath) { e.removeClass('hidden faded').addClass('highlighted'); return; }
      e.removeClass('highlighted faded');
      const bothInHighlight = s !== undefined && t !== undefined;
      const touchesRemoved = removedSet.has(e.source().id()) || removedSet.has(e.target().id());
      if (!bothInHighlight || touchesRemoved) {
        if (highlightGrewFromIso) e.addClass('hidden');
        else e.addClass('faded');
      } else {
        e.removeClass('hidden');
      }
    });
  });
  ctx.updateReadout();
  const dirLabel = highlightDir === 'down' ? 'enables' : 'requires';
  ctx.toast(`${ctx.nodeById.get(highlightRoot).name} · ${dirLabel} level ${highlightDepth} — ${highlightLevels.size - 1} total shown`);
  saveHighlight();
}

/* ── highlight persistence (localStorage dw.highlight, migrated from dw.trace) ── */
function saveHighlight() {
  if (highlightRoot === null) { localStorage.removeItem('dw.highlight'); return; }
  localStorage.setItem('dw.highlight', JSON.stringify({
    root: highlightRoot, dir: highlightDir, levels: Array.from(highlightLevels.entries()), depth: highlightDepth,
  }));
}
export function restoreHighlight() {
  let raw = localStorage.getItem('dw.highlight');
  if (!raw) {
    // migrate a pre-rename dw.trace key so saved highlight state survives the rename
    const legacy = localStorage.getItem('dw.trace');
    if (legacy) { localStorage.setItem('dw.highlight', legacy); localStorage.removeItem('dw.trace'); raw = legacy; }
  }
  if (!raw) return;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }
  if (!parsed.root || !parsed.dir) return;
  highlightRoot = parsed.root; highlightDir = parsed.dir;
  highlightLevels = new Map(parsed.levels || []);
  highlightDepth = parsed.depth || 0;
  highlightGrewFromIso = false;
  if (highlightLevels.size === 0) { localStorage.removeItem('dw.highlight'); return; }
  if (!ctx.nodeById.has(highlightRoot)) { localStorage.removeItem('dw.highlight'); return; }
  // Verify every highlighted node is actually in the graph — stale IDs from an old
  // dataset version must not render partial highlights
  for (const nid of highlightLevels.keys()) {
    if (!ctx.nodeById.has(nid)) { localStorage.removeItem('dw.highlight'); return; }
  }
  highlightId = highlightRoot;
  const frontierSet = new Set(
    [...highlightLevels.entries()].filter(([_, d]) => d === highlightDepth).map(([id]) => id)
  );
  // nodes hidden by category/orphan filters before the highlight — preserve that
  const preHiddenIds = new Set(ctx.cy.nodes('.hidden').map(n => n.id()));
  ctx.cy.batch(() => {
    ctx.cy.nodes().forEach(n => {
      const nid = n.id();
      n.removeClass('hidden faded highlighted');
      if (preHiddenIds.has(nid)) n.addClass('hidden');
      else if (highlightLevels.has(nid)) {
        if (frontierSet.has(nid)) n.addClass('highlighted');
      } else {
        n.addClass('faded');
      }
      if (nid === highlightRoot) n.addClass('sel');
    });
    ctx.cy.edges().forEach(e => {
      const s = highlightLevels.get(e.source().id()), t = highlightLevels.get(e.target().id());
      const onPath = s !== undefined && t !== undefined && Math.abs(s - t) === 1;
      if (onPath) { e.removeClass('hidden faded').addClass('highlighted'); return; }
      e.removeClass('highlighted faded');
      if (!(s !== undefined && t !== undefined)) e.addClass('faded');
    });
  });
  ctx.updateReadout();
}
