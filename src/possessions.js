/* ═══════════════════════════════════════════════════════════════
   POSSESSIONS — mark what you have, walk the atlas as unlocked
   (Phase 2c).

   The `owned` ledger and everything derived from it, extracted from app.js:
   the per-item marks, the forward reachability walk over recipe + skill edges,
   the gold-ring emphasis that is always on, and the dim/lock pass that
   Possessions mode adds on top.

   `owned` is a single mutable Set and is exported as-is, so the panel, the
   search stars, the plan builder and the path query all read and mark the same
   object without a wrapper. The rest of the cluster is private; app.js hands
   the module the graph, the two app-owned flags it reads (Possessions focus and
   the current isolation root) and the four repaint callbacks it triggers.
   ═══════════════════════════════════════════════════════════════ */

const D = window.DW_DATA;

// the ledger itself — restored per character by a page reload (dw.owned is one
// of characters.js's per-character STATE_KEYS)
export const owned = new Set(JSON.parse(localStorage.getItem('dw.owned') || '[]'));

let cy = null;
let isFocusOwned = () => false;
let getIsolatedRoot = () => null;
let afterVisibility = () => {};  // applyCategoryVisibility
let refreshReadout = () => {};   // updateReadout
let reflow = () => {};           // scheduleReflow
let fit = () => {};              // fitSoon
let ownedCountEl = null;

export function initPossessions({
  cy: graph, focusOwned, isolatedRoot,
  applyCategoryVisibility, updateReadout, scheduleReflow, fitSoon,
} = {}) {
  cy = graph;
  if (focusOwned) isFocusOwned = focusOwned;
  if (isolatedRoot) getIsolatedRoot = isolatedRoot;
  if (applyCategoryVisibility) afterVisibility = applyCategoryVisibility;
  if (updateReadout) refreshReadout = updateReadout;
  if (scheduleReflow) reflow = scheduleReflow;
  if (fitSoon) fit = fitSoon;
  ownedCountEl = document.getElementById('ownedCount');
}

export function persistOwned() {
  localStorage.setItem('dw.owned', JSON.stringify([...owned]));
  ownedCountEl.textContent = owned.size;
  ownedCountEl.classList.toggle('has', owned.size > 0);
}

// Toggle one item's owned mark and repaint — shared by the node panel and the
// search box's right-aligned favourite stars. Returns the new owned state.
export function toggleOwned(id) {
  if (owned.has(id)) owned.delete(id); else owned.add(id);
  persistOwned();
  applyPossessions();
  return owned.has(id);
}

function propagateReach() {
  // walk forward from owned nodes through recipe + skill edges
  const reach = new Set();
  const stack = [...owned];
  while (stack.length) {
    const cur = stack.pop();
    if (reach.has(cur)) continue;
    reach.add(cur);
    for (const e of D.edges) {
      if (e.from === cur && !reach.has(e.to)) stack.push(e.to);
    }
  }
  return reach;
}

// Owned emphasis that does NOT depend on Possessions mode (owned-items TODO):
// every owned node wears a gold ring, an edge with two owned endpoints is gold,
// and the next thing an owned item enables is teal. Possessions mode still adds
// the reach/dim treatment on top.
function applyOwnedMarks() {
  cy.nodes().forEach(n => { n.toggleClass('ownedMark', owned.has(n.id())); });
  cy.edges().forEach(e => {
    const s = owned.has(e.source().id());
    const t = owned.has(e.target().id());
    e.toggleClass('ownedEdge', s && t);
    e.toggleClass('ownedEnable', s && !t);
  });
}

export function applyPossessions() {
  applyOwnedMarks();
  if (!isFocusOwned()) {
    cy.batch(() => {
      cy.nodes().removeClass('locked reachable');
      cy.edges().removeClass('locked reachable');
      afterVisibility();
    });
    refreshReadout();
    reflow();
    if (!getIsolatedRoot()) fit();
    return;
  }
  const reach = propagateReach();
  cy.batch(() => {
    cy.nodes().forEach(n => {
      const id = n.id();
      n.removeClass('locked reachable');
      if (owned.has(id)) n.addClass('reachable');
      else if (reach.has(id)) n.addClass('reachable');
      else if (!n.hasClass('hidden')) n.addClass('locked');
    });
    cy.edges().forEach(e => {
      e.removeClass('locked reachable');
      const s = e.source().id(), t = e.target().id();
      if (reach.has(t) && (owned.has(s) || reach.has(s))) e.addClass('reachable');
      else if (!e.source().hasClass('hidden') && !e.target().hasClass('hidden')) e.addClass('locked');
    });
    afterVisibility();
  });
  refreshReadout();
  reflow();
}
