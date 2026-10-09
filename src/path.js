/* ═══════════════════════════════════════════════════════════════
   PATH QUERY — the two-node shortest material route (TODO #18, PF-3)
   Split out of src/app.js (Phase 2). Holds the arming state, the BFS over
   non-skill edges, the gold trail on the map, and the path bar / result rows.
   app.js injects the graph handle, lookup maps, ledger and the couple of
   app-level helpers it calls back into (selectNode / writeRoute / toast).
   ═══════════════════════════════════════════════════════════════ */
import { esc } from './util.js';

const D = window.DW_DATA;
const SKILL_NAMES = new Set(D.skills.map(s => s.name));

let ctx = {
  cy: null, nodeById: new Map(), owned: new Set(),
  iconImg: id => esc(id), selectNode: () => {}, writeRoute: () => {}, toast: () => {},
  searchInput: null, selectedId: () => null,
};
export function initPath(c) { Object.assign(ctx, c); }

// --- path between nodes (BFS over material edges, skills excluded) ---
let pathFrom = null;      // source id while arming
let pathArming = false;
let pathOwnedMode = false; // arming seeded by the possessions ledger (PF-3)
let lastPath = null;      // { from, to, steps: [{from, to, e}], multi? }

function findPath(a, b) {
  // undirected adjacency over non-skill edges (skill gates are metadata, not steps)
  const adj = new Map();
  const push = (x, v) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(v); };
  for (const e of D.edges) {
    if (SKILL_NAMES.has(e.from) || SKILL_NAMES.has(e.to)) continue;
    push(e.from, { to: e.to, e });
    push(e.to, { to: e.from, e });
  }
  // BFS from many sources at once (PF-3: everything you own); `a` may be a single id or a Set
  const sources = a instanceof Set ? [...a] : [a];
  const prev = new Map(sources.map(s => [s, null]));
  const q = [...sources];
  while (q.length) {
    const cur = q.shift();
    if (cur === b) break;
    for (const { to, e } of (adj.get(cur) || [])) {
      if (!prev.has(to)) { prev.set(to, { node: cur, e }); q.push(to); }
    }
  }
  if (!prev.has(b)) return null;
  const steps = [];
  for (let cur = b; prev.get(cur); cur = prev.get(cur).node) {
    const p = prev.get(cur);
    steps.unshift({ from: p.node, to: cur, e: p.e });
  }
  return steps;
}

// dedicated top bar for the armed path query (TODO #18) — visible from arming
// until the path is cleared, so the query state is never invisible
const pathbar = document.getElementById('pathbar');
function showPathbar(text, pulsing = true) {
  if (!pathbar) return;
  document.getElementById('pathbarText').textContent = text;
  pathbar.classList.remove('hidden');
  document.body.classList.toggle('path-result', !pulsing);
}
function hidePathbar() {
  if (pathbar) pathbar.classList.add('hidden');
  document.body.classList.remove('path-result');
}
if (pathbar) document.getElementById('pathbarCancel').onclick = () => { clearPath(); ctx.toast('Path query cancelled'); };

export function armPath(id) {
  pathFrom = id;
  pathArming = true;
  document.body.classList.add('path-arming');
  ctx.searchInput.dataset.armed = '1';
  ctx.searchInput.placeholder = `Path from “${ctx.nodeById.get(id).name}” — pick or type the target…`;
  ctx.searchInput.classList.add('arming');
  showPathbar(`Path from “${ctx.nodeById.get(id).name}” — tap the target on the map, or pick it via search`);
  ctx.toast(`Path FROM ${ctx.nodeById.get(id).name} — tap the target on the map, or pick it via search (Esc cancels)`);
}

export function disarmPath() {
  pathArming = false;
  pathFrom = null;
  pathOwnedMode = false;
  document.body.classList.remove('path-arming', 'path-arming-owned');
  delete ctx.searchInput.dataset.armed;
  ctx.searchInput.placeholder = 'Search items, stations, materials…';
  ctx.searchInput.classList.remove('arming');
  hidePathbar();
}

export function clearPath() {
  lastPath = null;
  disarmPath();
  hidePathbar();
  ctx.cy.elements().removeClass('faded highlighted');
  ctx.writeRoute(ctx.selectedId() ? [ctx.selectedId()] : []); // the trail is gone, the selection stays
}

export function runPath(a, b, multi = false) {
  disarmPath();
  const srcIds = multi ? [...a] : [a];
  if (!multi && a === b) { ctx.toast('Pick a different target — that is the same item'); return; }
  if (multi && srcIds.includes(b)) { ctx.toast('You already own the target — nothing to craft'); return; }
  const steps = findPath(multi ? new Set(srcIds) : a, b);
  if (!steps) {
    ctx.toast(multi
      ? `Nothing in your ledger leads to ${ctx.nodeById.get(b).name} — mark closer items as owned`
      : `No crafting path between ${ctx.nodeById.get(a).name} and ${ctx.nodeById.get(b).name}`);
    return;
  }
  lastPath = { from: multi ? srcIds : a, to: b, steps, multi };
  ctx.selectNode(b, { syncHash: false }); // renders target panel (which shows the path section) and clears old classes
  ctx.cy.batch(() => {
    ctx.cy.elements().addClass('faded');
    for (const s of steps) {
      ctx.cy.getElementById(s.from).removeClass('faded').addClass('highlighted');
      ctx.cy.getElementById(s.to).removeClass('faded').addClass('highlighted');
      const eid = s.e.from + '→' + s.e.to + ':' + s.e.qty + (s.e.variant ? ':' + s.e.variant : '');
      ctx.cy.getElementById(eid).removeClass('faded').addClass('highlighted');
    }
  });
  const fromTxt = multi
    ? `${srcIds.length} owned item${srcIds.length > 1 ? 's' : ''}`
    : ctx.nodeById.get(a).name;
  showPathbar(`Path: ${fromTxt} → ${ctx.nodeById.get(b).name} · ${steps.length} step${steps.length > 1 ? 's' : ''}`, false);
  ctx.toast(`Path: ${steps.length} step${steps.length > 1 ? 's' : ''} from ${fromTxt} to ${ctx.nodeById.get(b).name}`);
  // a multi-source query has no single "from" slug, so the URL keeps the target
  ctx.writeRoute(multi ? [b] : [a, b]);
}

// PF-3: path seeded with every item in the possessions ledger
function runPathOwned(b) {
  if (!ctx.owned.size) { ctx.toast('Mark items as owned first (✓ Owned in their panel)'); return; }
  runPath(new Set(ctx.owned), b, true);
}

// PF-3: arm a path query whose source is the whole ledger; next tap = target
export function armPathOwned() {
  if (!ctx.owned.size) { ctx.toast('Mark items as owned first (✓ Owned in their panel)'); return; }
  pathFrom = null;
  pathOwnedMode = true;
  pathArming = true;
  document.body.classList.add('path-arming', 'path-arming-owned');
  ctx.searchInput.dataset.armed = '1';
  ctx.searchInput.placeholder = `Path from your ${ctx.owned.size} owned item${ctx.owned.size > 1 ? 's' : ''} — pick the target…`;
  ctx.searchInput.classList.add('arming');
  showPathbar(`Path from your ${ctx.owned.size} owned item${ctx.owned.size > 1 ? 's' : ''} — tap the target on the map, or pick it via search`);
  ctx.toast(`Path FROM your ${ctx.owned.size} owned item${ctx.owned.size > 1 ? 's' : ''} — tap the target (Esc cancels)`);
}

export function pathStepsHTML(p) {
  const fromTxt = p.multi
    ? `your ${p.from.length} owned item${p.from.length > 1 ? 's' : ''}`
    : ctx.nodeById.get(p.from).name;
  const rows = p.steps.map((s, i) => {
    const qty = s.e.qty ? `<span class="q">${s.e.qty}×</span> ` : '';
    const fac = s.e.facility && s.e.facility !== 'Cast' ? `<span class="pstep-fac">${esc(s.e.facility)}</span>` : '';
    return `<div class="path-step" data-goto="${esc(s.to)}">
      <span class="pn">${i + 1}</span>${ctx.iconImg(s.from)}<span class="ptx">${qty}${esc(s.from)}</span>
      <span class="arr">→</span>${fac}${ctx.iconImg(s.to)}<span class="ptx">${esc(s.to)}</span>
    </div>`;
  }).join('');
  return `<div class="p-section"><div class="p-label">Path from ${esc(fromTxt)} (${p.steps.length} steps)
    <button class="p-clear" id="btnClearPath" title="Clear path">✕</button></div>${rows}
    <div class="p-hint">Gold trail = the shortest material route. Esc also clears.</div></div>`;
}


/* ── state accessors for app.js's canvas / search / keyboard handlers ─── */
export function pathArmed() { return pathArming; }
export function getLastPath() { return lastPath; }

// One tap/pick while a query is armed: resolves the target and returns true
// when the click was consumed. Returns false when it is a normal selection.
export function tryPathTarget(id) {
  if (!pathArming) return false;
  if (pathOwnedMode) {
    if (!ctx.owned.has(id)) { runPathOwned(id); return true; }
    return false;
  }
  if (pathFrom && id !== pathFrom) { runPath(pathFrom, id); return true; }
  return false;
}
