/* ═══════════════════════════════════════════════════════════════
   DRAGONWILDS ✦ CRAFTING ATLAS — application
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const D = window.DW_DATA;

/* ── lookup maps ─────────────────────────────────────────────── */
const nodeById = new Map();
for (const n of D.nodes) nodeById.set(n.id, n);
const outDegree = new Map();  // how many things this node is used to make
const inDegree = new Map();   // how many recipes produce this node
const SKILL_NAMES = new Set(D.skills.map(s => s.name));
for (const e of D.edges) {
  if (SKILL_NAMES.has(e.from)) continue; // skill-gate edges don't count as "made from"
  outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);
  inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
}

const kindColor = {
  weapon:   '#c96a4a',
  armour:   '#7fa8c9',
  tool:     '#c9a86a',
  station:  '#58c9b9',
  ammo:     '#b0b0b0',
  trinket:  '#a58cf0',
  food:     '#8fbf6a',
  potion:   '#e0709a',
  drink:    '#6ab0c9',
  material: '#e2b95c',
  resource: '#9a8f77',
  spell:    '#6ea8ff',
  skill:    '#f7dd9a',
  implicit: '#6d6a5e',
  other:    '#8a8577',
};
const kindLabel = {
  weapon: 'Weapons', armour: 'Armour', tool: 'Tools', station: 'Stations',
  ammo: 'Ammo', trinket: 'Trinkets', food: 'Food', potion: 'Potions',
  drink: 'Drinks', material: 'Materials', resource: 'Resources',
  spell: 'Spells', skill: 'Skills', implicit: 'Uncatalogued', other: 'Other',
};
const kindGlyph = { station: '⌂', resource: '⛰', implicit: '?', spell: '✦', skill: '★' };

function nodeColor(n) { return kindColor[n.kind] || kindColor.other; }

/* ── category filter state ───────────────────────────────────── */
const activeCats = new Set(Object.keys(kindLabel));
let showOrphans = false; // degree-0 items (drop-only, no recipes) hidden by default
let selectedId = null;
let isolatedRoot = null;
let tracedId = null;
let focusOwned = false;
const owned = new Set(JSON.parse(localStorage.getItem('dw.owned') || '[]'));

/* ── cytoscape setup ─────────────────────────────────────────── */
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: [],
  style: [
    {
      selector: 'node',
      style: {
        'background-color': '#161a25',
        'border-width': 2,
        'border-color': 'data(borderColor)',
        width: 'data(nodeSize)',
        height: 'data(nodeSize)',
        label: 'data(label)',
        'font-family': 'Alegreya Sans, sans-serif',
        'font-size': 9,
        color: '#a49d8c',
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-background-color': '#0a0c11',
        'text-background-opacity': 0.75,
        'text-background-padding': 2,
        'text-background-shape': 'roundrectangle',
        'text-wrap': 'ellipsis',
        'text-max-width': 90,
        'min-zoomed-font-size': 7,
        'overlay-padding': 3,
      },
    },
    {
      selector: 'node[?iconUrl]',
      style: {
        'background-image': 'data(iconUrl)',
        'background-fit': 'contain',
        'background-clip': 'none',
      },
    },
    {
      selector: 'node.noIcon',
      style: { 'background-opacity': 0.9, 'border-width': 1.5 },
    },
    {
      selector: 'edge',
      style: {
        width: 1.2,
        'line-color': 'data(lineColor)',
        'curve-style': 'haystack',
        'haystack-radius': 0.4,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7,
        'target-arrow-color': 'data(lineColor)',
      },
    },
    {
      selector: 'node.hoverN, edge.hoverN',
      style: {
        'border-color': '#f7dd9a',
        'line-color': 'rgba(226,185,92,0.55)',
        'target-arrow-color': 'rgba(226,185,92,0.55)',
        color: '#e9e4d6',
        'z-index': 90,
      },
    },
    {
      selector: 'edge.sel, edge.traced',
      style: {
        'line-color': '#e2b95c',
        'target-arrow-color': '#e2b95c',
        width: 2.2,
        'z-index': 99,
      },
    },
    {
      selector: 'node.sel, node.traced',
      style: {
        'border-color': '#f7dd9a',
        'border-width': 3,
        color: '#f7dd9a',
        'font-size': 12,
        'font-weight': 700,
        'z-index': 99,
      },
    },
    {
      selector: 'node.locked',
      style: {
        opacity: 0.13,
        'text-opacity': 0.08,
        'border-color': '#3a3f4c',
      },
    },
    {
      selector: 'edge.locked',
      style: { opacity: 0.05 },
    },
    {
      selector: 'node.reachable',
      style: { 'border-width': 2.5, 'overlay-color': 'rgba(226,185,92,0.35)', 'overlay-padding': 2 },
    },
    {
      selector: 'edge.reachable',
      style: { 'line-color': 'rgba(226,185,92,0.5)', 'target-arrow-color': 'rgba(226,185,92,0.5)' },
    },
    {
      selector: '.faded',
      style: { opacity: 0.08, 'text-opacity': 0.06 },
    },
    {
      selector: 'node.hidden, edge.hidden',
      style: { display: 'none' },
    },
  ],
  headless: false,
  wheelSensitivity: 0.22,
});
window.__cy = cy; // debug/testing hook

/* register cose-bilkent (bundled build) */
try {
  if (window.cytoscapeCoseBilkent) cytoscape.use(window.cytoscapeCoseBilkent);
} catch (e) { console.warn('bilkent registration issue', e); }
try {
  if (window.cytoscapeDagre) cytoscape.use(window.cytoscapeDagre);
} catch (e) { console.warn('dagre registration issue', e); }

/* ── graph build ─────────────────────────────────────────────── */
const eles = [];
const SKILL_EDGE_COLOR = 'rgba(247,221,154,0.20)';
const MAT_EDGE_COLOR = 'rgba(180,170,140,0.28)';
for (const n of D.nodes) {
  const deg = (outDegree.get(n.id) || 0) + (inDegree.get(n.id) || 0);
  eles.push({
    group: 'nodes',
    data: {
      id: n.id,
      label: n.name,
      iconUrl: n.icon || undefined,
      borderColor: nodeColor(n),
      nodeSize: 12 + Math.min(18, deg * 2),
      meta: { kind: n.kind, deg, itemType: n.itemType, description: n.description, stats: n.stats },
    },
    classes: n.icon ? '' : 'noIcon',
  });
}
for (const e of D.edges) {
  const isSkillGate = SKILL_NAMES.has(e.from);
  eles.push({
    group: 'edges',
    data: {
      id: e.from + '→' + e.to + ':' + e.qty + (e.variant ? ':' + e.variant : ''),
      source: e.from, target: e.to, meta: e,
      lineColor: isSkillGate ? SKILL_EDGE_COLOR : MAT_EDGE_COLOR,
    },
  });
}

let layoutRunning = false;
let layoutIndTimer = null;
const FORCE_LAYOUTS = new Set(['cose-bilkent', 'cose-bilkent-tight', 'cola', 'euler']);
let forceDir = true; // force-directed physics on/off

// each preset is a function so it can react to the force toggle
const LAYOUTS = {
  'cose-bilkent': () => ({
    name: 'cose-bilkent', animate: true, animationDuration: 700, animationEasing: 'ease-out',
    randomize: true, nodeSeparation: forceDir ? 120 : 170, idealEdgeLength: forceDir ? 110 : 170, nodeRepulsion: forceDir ? 22000 : 42000,
  }),
  'cose-bilkent-tight': () => ({
    name: 'cose-bilkent', animate: true, animationDuration: 700, animationEasing: 'ease-out',
    randomize: true, nodeSeparation: forceDir ? 60 : 110, idealEdgeLength: forceDir ? 55 : 130, nodeRepulsion: forceDir ? 9000 : 26000,
  }),
  cola: () => ({
    name: 'cola', animate: true, refresh: 5, maxSimulationTime: 4000,
    randomize: true, avoidOverlap: true, handleDisconnected: true, fit: false,
    nodeSpacing: forceDir ? 14 : 46, edgeLength: forceDir ? 95 : 175, convergenceThreshold: 0.01,
  }),
  euler: () => ({
    name: 'euler', animate: true, refresh: 4, maxIterations: 6000, maxSimulationTime: 10000,
    randomize: true, gravity: forceDir ? 0.01 : 0.004, springLength: forceDir ? 450 : 650,
    springCoeff: 0.0004, mass: 8, theta: 0.9, dragCoeff: 0.05, timeStep: 8,
  }),
  cise: () => ({
    name: 'cise', animate: true, maxSimulationTime: 4000, randomize: true,
  }),
  'elk-layered': () => ({
    name: 'elk', animate: false, padding: 30,
    elk: {
      algorithm: 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': forceDir ? 60 : 110,
      'elk.spacing.nodeNode': forceDir ? 24 : 46,
    },
  }),
  'elk-force': () => ({
    name: 'elk', animate: false, padding: 30,
    elk: { algorithm: 'force', 'elk.force.repulsion': forceDir ? 4000 : 12000, 'elk.force.iterations': 300 },
  }),
  breadthfirst: () => ({
    name: 'breadthfirst', directed: true, circle: false, grid: false, padding: 30,
    spacingFactor: forceDir ? 1.2 : 1.8, animate: true, animationDuration: 600,
  }),
  dagre: () => ({
    name: 'dagre', animate: true, animationDuration: 700, rankDir: 'TB',
    nodeSep: forceDir ? 24 : 44, edgeSep: 12, rankSep: forceDir ? 70 : 110,
  }),
  'dagre-lr': () => ({
    name: 'dagre', animate: true, animationDuration: 700, rankDir: 'LR',
    nodeSep: forceDir ? 20 : 40, edgeSep: 12, rankSep: forceDir ? 70 : 110,
  }),
  circle: () => ({ name: 'circle', animate: true, animationDuration: 700, spacingFactor: 1.4 }),
  concentric: () => ({ name: 'concentric', animate: true, animationDuration: 700, spacingFactor: 1.2 }),
  grid: () => ({ name: 'grid', animate: true, animationDuration: 700, spacingFactor: 1.6 }),
  random: () => ({ name: 'random', animate: true, animationDuration: 700, spacingFactor: 1.5 }),
};

function setLayoutIndicator(on, label) {
  const ind = document.getElementById('layoutInd');
  if (!ind) return;
  ind.classList.toggle('on', !!on);
  if (label) document.getElementById('layoutIndText').textContent = label;
  clearTimeout(layoutIndTimer);
  if (on) layoutIndTimer = setTimeout(() => ind.classList.remove('on'), 20000); // safety net
}

function runLayout(preset = currentLayout) {
  if (layoutRunning) return;
  layoutRunning = true;
  const make = LAYOUTS[preset] || LAYOUTS['cose-bilkent'];
  const opts = make();
  setLayoutIndicator(true, `Arranging · ${opts.name}${FORCE_LAYOUTS.has(preset) ? (forceDir ? ' · force' : ' · spread') : ''}…`);
  const lay = cy.layout(opts);
  lay.one('layoutstop', () => {
    layoutRunning = false;
    setLayoutIndicator(false);
    hideVeil();
    if (!isolatedRoot) cy.fit(undefined, 60);
  });
  lay.run();
}
let currentLayout = 'cose-bilkent';

/* populate */
const veil = document.getElementById('veil');
const veilSub = document.getElementById('veilSub');
veilSub.textContent = `${D.nodes.length.toLocaleString()} items · ${D.edges.length.toLocaleString()} links of fate`;

function hideVeil() {
  const v = document.getElementById('veil');
  if (v) { v.classList.add('hidden'); v.style.pointerEvents = 'none'; }
}
function populate() {
  try {
    cy.batch(() => {
      cy.add(eles);
      cy.nodes().forEach(n => { if (n.degree() === 0) n.addClass('orphan'); });
      applyCategoryVisibility();
    });
    runLayout();
  } catch (e) {
    console.error('populate failed:', e);
  }
  setTimeout(hideVeil, 850);
  setTimeout(hideVeil, 2500); // hard fallback
}
setTimeout(populate, 60); // rAF can stall in hidden/backgrounded tabs

/* ── visibility: category filter ─────────────────────────────── */
function catAllowed(kind) { return activeCats.has(kind); }
function applyCategoryVisibility() {
  cy.batch(() => {
    for (const n of cy.nodes()) {
      const allow = catAllowed(n.data('meta').kind) && (showOrphans || !n.hasClass('orphan'));
      n.removeClass('hidden');
      if (!allow) n.addClass('hidden');
    }
    for (const e of cy.edges()) {
      e.removeClass('hidden');
      if (e.source().hasClass('hidden') || e.target().hasClass('hidden')) e.addClass('hidden');
    }
  });
  updateReadout();
  if (!isolatedRoot) fitSoon();
}

let fitTimer = null;
function fitSoon() {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => { if (!isolatedRoot) cy.fit(undefined, 60); }, 400);
}

const edgePrefs = { materials: true, skills: true }; // toggle via header chips
function applyEdgeVisibility() {
  cy.batch(() => {
    for (const e of cy.edges()) {
      const isSkill = SKILL_NAMES.has(e.source().id());
      e.toggleClass('hidden', (isSkill && !edgePrefs.skills) || (!isSkill && !edgePrefs.materials));
      if (!e.hasClass('hidden') && (e.source().hasClass('hidden') || e.target().hasClass('hidden'))) e.addClass('hidden');
    }
  });
}

/* ── legend ──────────────────────────────────────────────────── */
const legend = document.getElementById('legend');
for (const k of ['weapon', 'armour', 'tool', 'station', 'trinket', 'food', 'potion', 'material', 'spell', 'skill', 'other']) {
  const row = document.createElement('div');
  row.className = 'lg-row';
  row.innerHTML = `<span class="lg-swatch" style="background:${kindColor[k]}"></span>${kindLabel[k]}`;
  row.onclick = () => {
    const chip = document.querySelector(`.chip[data-cat="${k}"]`);
    if (chip) chip.click();
  };
  legend.appendChild(row);
}

/* ── filter chips ────────────────────────────────────────────── */
document.querySelectorAll('.chip[data-cat]').forEach(chip => {
  chip.classList.add('on');
  chip.onclick = () => {
    const cat = chip.dataset.cat;
    if (activeCats.has(cat)) { activeCats.delete(cat); chip.classList.remove('on'); }
    else { activeCats.add(cat); chip.classList.add('on'); }
    applyCategoryVisibility();
  };
});
document.getElementById('resetFilters').onclick = () => {
  for (const k of Object.keys(kindLabel)) activeCats.add(k);
  document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.add('on'));
  applyCategoryVisibility();
};

document.getElementById('orphansChip').onclick = () => {
  showOrphans = !showOrphans;
  document.getElementById('orphansChip').classList.toggle('on', showOrphans);
  applyCategoryVisibility();
};

document.getElementById('edgeMatChip').onclick = () => {
  edgePrefs.materials = !edgePrefs.materials;
  document.getElementById('edgeMatChip').classList.toggle('on', edgePrefs.materials);
  applyEdgeVisibility();
};
document.getElementById('edgeSkillChip').onclick = () => {
  edgePrefs.skills = !edgePrefs.skills;
  document.getElementById('edgeSkillChip').classList.toggle('on', edgePrefs.skills);
  applyEdgeVisibility();
};

document.getElementById('possessionsChip').onclick = () => {
  focusOwned = !focusOwned;
  document.getElementById('possessionsChip').classList.toggle('on', focusOwned);
  applyPossessions();
  toast(focusOwned
    ? (owned.size ? `Showing what you can reach from ${owned.size} owned items` : 'Mark items as owned in their panel first')
    : 'Showing everything');
};

function updateReadout() {
  const visible = cy.nodes(':visible').length;
  const shownLinks = cy.edges(':visible').length;
  // DB counts under the brand (TODO: move out of header-right)
  const db = document.getElementById('dbcounts');
  if (db) db.innerHTML =
    `<b>${D.nodes.length.toLocaleString()}</b> items · <b>${D.edges.length.toLocaleString()}</b> links · <b>${D.recipes.length.toLocaleString()}</b> recipes`;
  // shown counts + active algorithm under the layout selector
  const meta = document.getElementById('layoutMeta');
  if (meta) {
    const algo = (LAYOUTS[currentLayout] || LAYOUTS['cose-bilkent'])().name;
    meta.innerHTML =
      `<span><b>${visible.toLocaleString()}</b> nodes shown · <b>${shownLinks.toLocaleString()}</b> links shown</span>` +
      `<span>algorithm: <span class="algo">${esc(algo)}</span>${FORCE_LAYOUTS.has(currentLayout) ? (forceDir ? ' · force' : ' · spread') : ''}</span>`;
  }
}

/* ── zoom controls ───────────────────────────────────────────── */
document.getElementById('zoomIn').onclick = () => cy.zoom(cy.zoom() * 1.35);
document.getElementById('zoomOut').onclick = () => cy.zoom(cy.zoom() / 1.35);
document.getElementById('zoomFit').onclick = () => cy.fit(undefined, 60);

/* ── layout selector ─────────────────────────────────────────── */
const layoutSelect = document.getElementById('layoutSelect');
const forceToggleWrap = document.getElementById('forceToggleWrap');
const forceToggle = document.getElementById('forceToggle');
function syncForceToggleUI() {
  const applicable = FORCE_LAYOUTS.has(currentLayout);
  if (forceToggleWrap) forceToggleWrap.classList.toggle('off', !applicable);
  if (forceToggle) forceToggle.disabled = !applicable;
}
if (layoutSelect) {
  layoutSelect.value = currentLayout;
  layoutSelect.onchange = () => { currentLayout = layoutSelect.value; syncForceToggleUI(); updateReadout(); runLayout(); };
}
if (forceToggle) {
  forceToggle.onchange = () => {
    forceDir = forceToggle.checked;
    updateReadout();
    if (FORCE_LAYOUTS.has(currentLayout)) runLayout();
  };
}
syncForceToggleUI();

/* ── toast ───────────────────────────────────────────────────── */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ── welcome stats ───────────────────────────────────────────── */
document.getElementById('welcomeStats').innerHTML = `
  <div><b>${D.nodes.length.toLocaleString()}</b>items</div>
  <div><b>${D.recipes.length.toLocaleString()}</b>recipes</div>
  <div><b>${D.spells.length}</b>spells</div>
  <div><b>${D.skills.length}</b>skills</div>`;

/* ═══════════════════════════════════════════════════════════════
   POSSESSIONS — mark what you have, walk the atlas as unlocked
   ═══════════════════════════════════════════════════════════════ */

function persistOwned() {
  localStorage.setItem('dw.owned', JSON.stringify([...owned]));
  ownedCountEl.textContent = owned.size;
  ownedCountEl.classList.toggle('has', owned.size > 0);
}
const ownedCountEl = document.getElementById('ownedCount');

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

function applyPossessions() {
  if (!focusOwned) {
    cy.batch(() => {
      cy.nodes().removeClass('locked reachable');
      cy.edges().removeClass('locked reachable');
      applyCategoryVisibility();
    });
    updateReadout();
    if (!isolatedRoot) fitSoon();
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
    applyCategoryVisibility();
  });
  updateReadout();
}

/* ── selection / isolation / panel ──────────────────────────── */

function selectNode(id, { fly = true } = {}) {
  document.getElementById('welcome').classList.add('hidden');
  selectedId = id;
  const n0 = nodeById.get(id);
  if (n0 && showOrphans === false) {
    const el = cy.getElementById(id);
    if (el.length && el.hasClass('orphan')) {
      showOrphans = true;
      document.getElementById('orphansChip').classList.add('on');
      applyCategoryVisibility();
    }
  }
  const n = cy.getElementById(id);
  if (!n || n.length === 0) return;
  cy.elements().removeClass('sel traced faded');
  cy.getElementById(id).addClass('sel');
  if (fly) cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 420 });
  openPanel(id);
  updateBreadcrumb();
}

function clearIsolation() {
  isolatedRoot = null;
  tracedId = null;
  cy.batch(() => {
    cy.nodes().removeClass('hidden traced').style({ opacity: '' });
    cy.edges().removeClass('hidden traced').style({ opacity: '' });
    applyCategoryVisibility();
  });
  document.getElementById('breadcrumb').classList.add('hidden');
  fitSoon();
}

function isolateTree(id) {
  isolatedRoot = id;
  // walk both directions: everything that feeds into the item AND everything
  // it can make, all the way until only leaf nodes remain
  const keep = new Set([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of D.edges) {
      if (e.from === cur && !keep.has(e.to)) { keep.add(e.to); stack.push(e.to); }
      if (e.to === cur && !keep.has(e.from)) { keep.add(e.from); stack.push(e.from); }
    }
  }
  cy.batch(() => {
    // auto-reveal every kind so the tree is fully visible regardless of filters
    for (const k of Object.keys(kindLabel)) activeCats.add(k);
    document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.add('on'));
    showOrphans = false;
    document.getElementById('orphansChip').classList.remove('on');
    cy.nodes().forEach(n => {
      if (!keep.has(n.id())) n.addClass('hidden');
      else n.removeClass('hidden');
    });
    cy.edges().forEach(e => {
      if (keep.has(e.source().id()) && keep.has(e.target().id())) e.removeClass('hidden');
      else e.addClass('hidden');
    });
  });
  selectNode(id, { fly: false });
  setTimeout(() => cy.fit(undefined, 70), 60);
  toast(`Crafting tree of ${nodeById.get(id).name}`);
}

function traceInputs(id) {
  tracedId = id;
  const keep = new Set([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of D.edges) {
      if (e.to === cur && !keep.has(e.from)) { keep.add(e.from); stack.push(e.from); }
    }
  }
  cy.batch(() => {
    cy.elements().addClass('faded');
    cy.nodes().forEach(n => { if (keep.has(n.id())) n.removeClass('faded').addClass('traced'); });
    cy.edges().forEach(e => {
      if (keep.has(e.source().id()) && keep.has(e.target().id())) e.removeClass('faded').addClass('traced');
    });
  });
  toast(`Inputs of ${nodeById.get(id).name} highlighted`);
}

function clearTrace() {
  tracedId = null;
  cy.elements().removeClass('faded traced');
}

/* ── canvas events ───────────────────────────────────────────── */
cy.on('tap', 'node', (evt) => {
  const id = evt.target.id();
  closeSuggestions();
  const oe = evt.originalEvent || {};
  if (oe.shiftKey) { isolateTree(id); return; }
  selectNode(id);
});
cy.on('tap', (evt) => {
  if (evt.target === cy) { document.getElementById('welcome').classList.add('hidden'); closePanel(); clearTrace(); }
});

let hoverTimer = null;
let hovered = null;
cy.on('mouseover', 'node', (evt) => {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (tracedId || isolatedRoot) return;
    hovered = evt.target;
    evt.target.neighborhood().union(evt.target).addClass('hoverN');
  }, 100);
});
cy.on('mouseout', 'node', () => {
  clearTimeout(hoverTimer);
  if (hovered) { cy.elements().removeClass('hoverN'); hovered = null; }
});

/* ── panel ───────────────────────────────────────────────────── */
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');

function iconImg(id, cls = '') {
  const n = nodeById.get(id);
  if (n && n.icon) return `<img src="${n.icon}" alt="" loading="lazy" class="${cls}">`;
  return `<span class="p-glyph" style="display:grid;place-items:center;width:100%;height:100%">${kindGlyph[n ? n.kind : 'other'] || '✦'}</span>`;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function facilityIcon(facility) {
  const st = D.nodes.find(n => n.id === facility && n.kind === 'station');
  return st && st.icon ? `<img src="${st.icon}" alt="">` : '';
}

function openPanel(id) {
  const n = nodeById.get(id);
  if (!n) return;
  const sp = D.spells.find(s => s.name === id);
  document.getElementById('panelTitle').textContent = n.name;
  document.getElementById('panelType').textContent = n.kind === 'skill'
    ? 'Skill'
    : (n.kind === 'spell' && sp
      ? `Spell · ${sp.skill || '?'}${sp.level ? ' lvl ' + sp.level : ''}`
      : (n.itemType || kindLabel[n.kind] || n.kind) +
        (inDegree.get(id) ? ` · made by ${inDegree.get(id)} recipe${inDegree.get(id) > 1 ? 's' : ''}` : '') +
        (outDegree.get(id) ? ` · used in ${outDegree.get(id)}` : ''));
  document.getElementById('panelIcon').innerHTML = iconImg(id);
  renderPanelBody(n);
  panel.classList.add('open');
}

function closePanel() {
  panel.classList.remove('open');
  selectedId = null;
  cy.elements().removeClass('sel');
  updateBreadcrumb();
}

document.getElementById('panelClose').onclick = closePanel;

function ownedBtnHTML(id) {
  const has = owned.has(id);
  return `<button class="btn ${has ? 'primary' : ''}" id="btnOwn" data-owned="${has}">${has ? '✓ Owned' : '☆ Mark owned'}</button>`;
}

function renderPanelBody(n) {
  const id = n.id;
  const recipesIn = D.recipes.filter(r => r.output === id);
  const usedIn = D.edges.filter(e => e.from === id && !SKILL_NAMES.has(e.from));
  const spell = D.spells.find(s => s.name === id);
  const skill = D.skills.find(s => s.name === id);
  const unlocks = D.skillLevelForItem[id] || [];

  const sections = [];

  // description
  if (n.description && n.description.length) {
    sections.push(`<div class="p-section"><div class="p-label">Description</div>
      <div class="p-desc">${n.description.map(esc).join('<br>')}</div></div>`);
  }

  // stats
  if (n.stats && Object.keys(n.stats).length) {
    const statLabel = { power: 'Power', basedmg: 'Base dmg', damagetype: 'Type', meleedefence: 'Melee def', rangeddefence: 'Ranged def', magicdefence: 'Magic def', durability: 'Durability', block: 'Block', health: 'Health', hydration: 'Hydration', sustenance: 'Sustenance', weight: 'Weight' };
    sections.push(`<div class="p-section"><div class="p-label">Stats</div><div class="p-stats">${
      Object.entries(n.stats).map(([k, v]) =>
        `<div class="p-stat"><div class="v">${esc(v)}</div><div class="k">${esc(statLabel[k] || k)}</div></div>`).join('')
    }</div></div>`);
  }

  // skill hub panel: its unlock ladder (only meaningful unlocks)
  if (skill) {
    const rows = skill.unlocks.filter(u => u.text && !/^-[\d.]+%/.test(u.text) && u.text !== '-').map(u =>
      `<div class="unlock-row"><span class="lvl">${u.level}</span><span class="utx">${esc(u.text)}</span></div>`).join('');
    if (rows) sections.push(`<div class="p-section"><div class="p-label">Level unlocks</div>${rows}</div>`);
  }

  // spells: rune requirements + skill gate
  if (spell) {
    const runes = Object.entries(spell.runes || {});
    sections.push(`<div class="p-section"><div class="p-label">Spell</div>
      <div class="p-stats" style="grid-template-columns:repeat(2,1fr)">
        <div class="p-stat"><div class="v">${esc(spell.skill || '—')}${spell.level ? ' · lvl ' + spell.level : ''}</div><div class="k">Requires</div></div>
        <div class="p-stat"><div class="v">${esc(spell.cooldown || '—')}</div><div class="k">Cooldown</div></div>
      </div>
      ${runes.length ? `<div class="p-label" style="margin-top:10px">Cast cost</div><div class="recipe-mats">${runes.map(([r, q]) => {
        let rn = /rune$/i.test(r) ? r : r + ' Rune';
        if (!nodeById.get(rn)) rn = rn.replace(/\bRune\b/i, 'rune');
        return `<span class="mat" data-goto="${esc(rn)}">${iconImg(rn)}${esc(r)} × ${esc(q)}</span>`;
      }).join('')}</div>` : ''}
      ${spell.description && spell.description.length ? `<div class="p-desc" style="margin-top:8px">${spell.description.map(esc).join('<br>')}</div>` : ''}
    </div>`);
  }

  // skill gates on this item
  if (unlocks.length) {
    sections.push(`<div class="p-section"><div class="p-label">Skill gates</div>${
      unlocks.map(u => `<div class="unlock-row"><span class="lvl">${u.level}</span><span class="utx">${esc(u.skill)} ${u.level} — ${esc(u.text)}</span></div>`).join('')
    }</div>`);
  }

  // recipes producing this item — facility is clickable
  if (recipesIn.length) {
    sections.push(`<div class="p-section"><div class="p-label">How to make ${recipesIn.length > 1 ? `(${recipesIn.length} ways)` : ''}</div>${
      recipesIn.map(r => recipeCard(r)).join('')
    }</div>`);
  }

  // used in
  if (usedIn.length) {
    const byOut = new Map();
    for (const e of usedIn) {
      if (!byOut.has(e.to)) byOut.set(e.to, []);
      byOut.get(e.to).push(e);
    }
    const rows = [...byOut.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([out, es]) =>
      `<div class="used-row" data-goto="${esc(out)}">${iconImg(out)}<span class="un">${esc(out)}</span><span class="uout">${es.map(e => '×' + e.qty + (e.facility ? ' ' + e.facility : '')).join(', ')}</span></div>`
    ).join('');
    sections.push(`<div class="p-section"><div class="p-label">Used to make (${byOut.size})</div>${rows}</div>`);
  }

  // direct materials of the first recipe
  if (recipesIn.length && recipesIn[0].inputs.length) {
    sections.push(`<div class="p-section"><div class="p-label">Direct materials</div><div class="recipe-mats">${
      recipesIn[0].inputs.map(i => `<span class="mat" data-goto="${esc(i.name)}">${iconImg(i.name)}<span class="q">${i.qty}×</span><span class="mn">${esc(i.name)}</span></span>`).join('')
    }</div></div>`);
  }

  // actions
  sections.push(`<div class="p-section p-actions">
    ${ownedBtnHTML(id)}
    <button class="btn" id="btnTrace">Trace inputs</button>
    <button class="btn primary" id="btnIsolate">Isolate tree</button>
  </div>
  <div class="p-section p-actions">
    <a class="btn" href="${n.wiki}" target="_blank" rel="noopener">Wiki page ↗</a>
  </div>`);

  panelBody.innerHTML = sections.join('');
  panelBody.scrollTop = 0;

  // wire actions
  panelBody.querySelectorAll('[data-goto]').forEach(el => {
    el.onclick = () => { selectNode(el.dataset.goto); };
  });
  const bt = document.getElementById('btnTrace');
  if (bt) bt.onclick = () => traceInputs(id);
  const bi = document.getElementById('btnIsolate');
  if (bi) bi.onclick = () => isolateTree(id);
  const bo = document.getElementById('btnOwn');
  if (bo) bo.onclick = () => {
    if (owned.has(id)) owned.delete(id); else owned.add(id);
    persistOwned();
    applyPossessions();
    renderPanelBody(n);
    toast(owned.has(id) ? `Marked owned: ${n.name}` : `Unmarked: ${n.name}`);
  };
}

function recipeCard(r) {
  const facility = r.facility || (r.blueprint ? r.blueprint : '—');
  const variant = r.variant && r.variant.toLowerCase() !== String(facility).toLowerCase() ? r.variant : null;
  // facilities that match a known station node become clickable
  const facNode = facility !== '—' && nodeById.get(facility);
  const facHTML = facNode
    ? `<span class="recipe-facility fac-link" data-goto="${esc(facNode.id)}">${facilityIcon(facNode.id)}${esc(facNode.name)}</span>`
    : `<span class="recipe-facility">${esc(facility)}</span>`;
  return `<div class="recipe ${r.deprecated ? 'deprecated' : ''}">
    <div class="recipe-head">
      ${facHTML}
      ${variant ? `<span class="recipe-variant">${esc(variant)}</span>` : ''}
      ${r.skill ? `<span class="recipe-skill" ${SKILL_NAMES.has(r.skill) ? `data-goto="${esc(r.skill)}" style="cursor:pointer"` : ''}>${skillIcon(r.skill)}${esc(r.skill)}${r.xp ? ' +' + r.xp + 'xp' : ''}</span>` : ''}
    </div>
    <div class="recipe-mats">${r.inputs.map(i =>
      `<span class="mat" data-goto="${esc(i.name)}">${iconImg(i.name)}<span class="q">${i.qty}×</span><span class="mn">${esc(i.name)}</span></span>`
    ).join('')}</div>
    ${r.notes && r.notes.length ? `<div class="recipe-notes">${r.notes.map(esc).join(' · ')}</div>` : ''}
  </div>`;
}

function skillIcon(name) {
  const s = D.skills.find(x => x.name === name);
  return s && s.icon ? `<img src="${s.icon}" alt="">` : '';
}

/* ── breadcrumb ──────────────────────────────────────────────── */
function updateBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  if (!isolatedRoot) { bc.classList.add('hidden'); return; }
  const chain = [];
  let cur = selectedId;
  const guard = new Set();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    chain.push(cur);
    const e = D.edges.find(e => e.to === cur && !SKILL_NAMES.has(e.from));
    if (!e) break;
    cur = e.from;
  }
  chain.reverse();
  if (chain.length < 1) { bc.classList.add('hidden'); return; }
  bc.innerHTML = chain.map((c, i) =>
    `<a data-goto="${esc(c)}">${esc(nodeById.get(c)?.name || c)}</a>${i < chain.length - 1 ? '<span class="sep">←</span>' : ''}`
  ).join('');
  bc.classList.remove('hidden');
  bc.querySelectorAll('[data-goto]').forEach(a => a.onclick = () => selectNode(a.dataset.goto));
}

/* ═══════════════════════════════════════════════════════════════
   SEARCH
   ═══════════════════════════════════════════════════════════════ */
const searchInput = document.getElementById('search');
const suggestions = document.getElementById('suggestions');
const searchClear = document.getElementById('searchClear');
let sugIndex = -1;
let sugItems = [];

function closeSuggestions() {
  suggestions.classList.remove('open');
  sugIndex = -1;
}

function fuzzyScore(q, text) {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 700 - idx * 2 - t.length * 0.1;
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    if (found === ti) streak++; else streak = 0;
    score += streak * 3 - (found - ti) * 0.2;
    ti = found + 1;
  }
  return score;
}

function highlight(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.style.display = q ? 'block' : 'none';
  if (q.length < 1) { closeSuggestions(); return; }
  const scored = [];
  for (const n of D.nodes) {
    const s = fuzzyScore(q.toLowerCase(), n.name.toLowerCase());
    if (s > 0) scored.push([s, n]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  sugItems = scored.slice(0, 30).map(x => x[1]);
  if (!sugItems.length) { closeSuggestions(); return; }
  suggestions.innerHTML = sugItems.map((n, i) => `
    <div class="sug-item" data-i="${i}">
      ${n.icon ? `<img src="${n.icon}" alt="">` : `<span class="sug-ico">${kindGlyph[n.kind] || '✦'}</span>`}
      <div class="sug-name">
        <div class="n">${highlight(n.name, q)}</div>
        <div class="t">${esc(kindLabel[n.kind] || n.kind)}${outDegree.get(n.id) ? ' · used in ' + outDegree.get(n.id) : ''}</div>
      </div>
    </div>`).join('');
  suggestions.classList.add('open');
  sugIndex = -1;
  suggestions.querySelectorAll('.sug-item').forEach(el => {
    el.onclick = () => {
      const n = sugItems[Number(el.dataset.i)];
      closeSuggestions();
      searchInput.value = n.name;
      searchClear.style.display = 'block';
      selectNode(n.id);
    };
  });
});

searchInput.addEventListener('keydown', (e) => {
  const items = suggestions.querySelectorAll('.sug-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); sugIndex = Math.min(sugIndex + 1, items.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sugIndex = Math.max(sugIndex - 1, 0); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const pick = sugItems[Math.max(0, sugIndex)];
    if (pick) {
      closeSuggestions();
      selectNode(pick.id);
      searchInput.blur();
    }
    return;
  } else if (e.key === 'Escape') { closeSuggestions(); searchInput.blur(); return; }
  else return;
  items.forEach((el, i) => el.classList.toggle('active', i === sugIndex));
  if (items[sugIndex]) items[sugIndex].scrollIntoView({ block: 'nearest' });
});

searchClear.onclick = () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  closeSuggestions();
  searchInput.focus();
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) closeSuggestions();
});

/* ── keyboard shortcuts ──────────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.target === searchInput || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === '/') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
  else if (e.key === 'Escape') { if (isolatedRoot) clearIsolation(); closePanel(); clearTrace(); }
  else if (e.key === 'f' || e.key === 'F') cy.fit(undefined, 60);
});

/* ═══════════════════════════════════════════════════════════════
   MINIMAP
   ═══════════════════════════════════════════════════════════════ */
const minimap = document.getElementById('minimap');
minimap.hidden = false;
const mmCanvas = document.getElementById('mmCanvas');
const mmViewport = document.getElementById('mmViewport');
const mmCtx = mmCanvas.getContext('2d');
let mmDirty = true;

function mmResize() {
  const r = minimap.getBoundingClientRect();
  mmCanvas.width = r.width * devicePixelRatio;
  mmCanvas.height = r.height * devicePixelRatio;
  mmDirty = true;
}
window.addEventListener('resize', mmResize);
mmResize();

function drawMinimap() {
  if (mmDirty) {
    mmCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    mmCtx.clearRect(0, 0, mmCanvas.width, mmCanvas.height);
    const w = mmCanvas.width / devicePixelRatio, h = mmCanvas.height / devicePixelRatio;
    const bb = cy.nodes(':visible').boundingBox({});
    if (bb && bb.w > 0) {
      const scale = Math.min((w - 8) / bb.w, (h - 8) / bb.h);
      const ox = (w - bb.w * scale) / 2 - bb.x1 * scale;
      const oy = (h - bb.h * scale) / 2 - bb.y1 * scale;
      for (const n of cy.nodes(':visible')) {
        const p = n.position();
        mmCtx.fillStyle = n.hasClass('locked') ? '#333' : nodeColor(n.data('meta'));
        mmCtx.globalAlpha = n.hasClass('locked') ? 0.25 : 0.75;
        mmCtx.fillRect(ox + p.x * scale - 1, oy + p.y * scale - 1, 2.2, 2.2);
      }
      mmCtx.globalAlpha = 1;
      const extent = cy.extent();
      mmViewport.style.left = (ox + extent.x1 * scale) + 'px';
      mmViewport.style.top = (oy + extent.y1 * scale) + 'px';
      mmViewport.style.width = (extent.w * scale) + 'px';
      mmViewport.style.height = (extent.h * scale) + 'px';
    }
    mmDirty = false;
  }
}

cy.on('position resize add remove', () => { mmDirty = true; });
cy.on('viewport', () => { mmDirty = true; });
(function mmLoop() { drawMinimap(); requestAnimationFrame(mmLoop); })();
minimap.onclick = (e) => {
  const rect = minimap.getBoundingClientRect();
  const bb = cy.nodes(':visible').boundingBox({});
  if (!bb || bb.w <= 0) return;
  const w = rect.width, h = rect.height;
  const scale = Math.min((w - 8) / bb.w, (h - 8) / bb.h);
  const ox = (w - bb.w * scale) / 2 - bb.x1 * scale;
  const oy = (h - bb.h * scale) / 2 - bb.y1 * scale;
  const wx = (e.clientX - rect.left - ox) / scale;
  const wy = (e.clientY - rect.top - oy) / scale;
  cy.animate({ center: { x: wx, y: wy } }, { duration: 300 });
};

/* ── boot ────────────────────────────────────────────────────── */
persistOwned();
applyPossessions();
updateReadout();
console.log(`Dragonwilds Crafting Atlas: ${D.nodes.length} nodes, ${D.edges.length} edges, ${D.recipes.length} recipes`);
