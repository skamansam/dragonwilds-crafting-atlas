// Builds site/data.cyjs: the entire Crafting Atlas as a Cytoscape.js JSON
// network in the *array style* — the only notation Cytoscape Desktop 3.1+
// reads (manual §7.2 "Cytoscape.js JSON"). Import via File ▸ Import ▸
// Network ▸ File, choosing format "Cytoscape.js JSON".
//
// Node ids are item/station/skill/spell names (the atlas' own ids, so panels
// and wiki links stay joinable). Every DW_DATA field becomes a node table
// column; edges carry qty/facility/skill/xp plus an `interaction` column:
//   craft       — recipe input edge (facility = the station that consumes it)
//   spell       — spell cast cost (e.g. Air Rune → Windstep)
//   skill-gate  — skill unlock edge (source is a skill node)
// A deterministic layered seed layout (primary-recipe depth, raw materials
// at the bottom) is baked into `position` so the network opens readable;
// re-layout any time from Desktop's Layout menu.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// site/data.js is a plain `window.DW_DATA = {...}` object literal — eval it.
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'site/data.js'), 'utf8'), ctx);
const D = ctx.window.DW_DATA;

const idSet = new Set(D.nodes.map(n => n.id));
const skillNames = new Set((D.skills || []).map(s => s.name));

// ---------- nodes ----------
const nodes = D.nodes.map(n => ({
  selected: false,
  data: {
    id: n.id,
    name: n.name,
    shared_name: n.name, // Desktop convention: shared_name mirrors name
    kind: n.kind,
    itemType: n.itemType ?? null,
    category: n.itemType || n.kind, // single convenience column for visual mappings
    wiki: n.wiki ?? null,
    pageid: n.pageid ?? null,
    weight: n.weight ?? null,
    stacklimit: n.stacklimit ?? null,
    repaircost: n.repaircost ?? null,
    catalogue: n.catalogue ?? null,
    description: (n.description || []).join(' ') || null,
    stats: Object.keys(n.stats || {}).length
      ? Object.entries(n.stats).map(([k, v]) => `${k}=${v}`).join('; ')
      : null,
    icon: n.icon
      ? `https://rudeboy.dev/dragonwilds-crafting-atlas/${n.icon}`
      : null,
  },
}));

// ---------- edges ----------
const edges = [];
let droppedEdges = 0;
for (const e of D.edges) {
  if (!idSet.has(e.from) || !idSet.has(e.to)) { droppedEdges++; continue; }
  const interaction = skillNames.has(e.from) ? 'skill-gate' : (e.facility === 'Cast' ? 'spell' : 'craft');
  const name = `${e.from} (${interaction}) ${e.to}`;
  edges.push({
    selected: false,
    data: {
      id: `e${edges.length}`,
      source: e.from,
      target: e.to,
      interaction,
      shared_interaction: interaction,
      name,
      shared_name: name,
      qty: e.qty ?? null,
      facility: e.facility ?? null,
      skill: e.skill ?? null,
      xp: e.xp ?? null,
      blueprint: e.blueprint ?? null,
      variant: e.variant ?? null,
      deprecated: !!e.deprecated,
      sourceRecipe: e.source ?? null,
    },
  });
}

// ---------- deterministic seed layout (layered by primary-recipe depth) ----------
const parents = new Map(); // output -> first non-deprecated recipe
for (const r of D.recipes) {
  if (r.deprecated || parents.has(r.output)) continue;
  parents.set(r.output, r);
}
const inputsOf = new Map();
for (const [out, r] of parents) {
  for (const i of r.inputs) {
    if (!inputsOf.has(out)) inputsOf.set(out, []);
    inputsOf.get(out).push(i.name);
  }
}
const layer = new Map();
const depthOf = x => {
  if (layer.has(x)) return layer.get(x);
  layer.set(x, 0); // cycle guard
  let l = 0;
  for (const i of (inputsOf.get(x) || [])) {
    if (idSet.has(i)) l = Math.max(l, depthOf(i) + 1);
  }
  layer.set(x, l);
  return l;
};
for (const n of D.nodes) depthOf(n.id);

const byLayer = new Map();
for (const n of D.nodes) {
  const l = layer.get(n.id);
  if (!byLayer.has(l)) byLayer.set(l, []);
  byLayer.get(l).push(n.id);
}
const LAYER_H = 320, COL_W = 78;
for (const n of nodes) {
  const l = layer.get(n.data.id);
  const arr = byLayer.get(l);
  const i = arr.indexOf(n.data.id);
  const span = (arr.length - 1) / 2;
  n.position = { x: Math.round((i - span) * COL_W), y: Math.round(-l * LAYER_H) };
}

// ---------- write ----------
const out = {
  data: {
    id: 'dragonwilds-crafting-atlas',
    name: 'Dragonwilds Crafting Atlas',
    source: D.source,
    generatedAt: D.generatedAt,
    description: 'All items, stations, skills and spells of RuneScape: Dragonwilds as one dependency graph. interaction: craft | spell | skill-gate.',
  },
  elements: { nodes, edges },
};

const dest = path.join(ROOT, 'site/data.cyjs');
fs.writeFileSync(dest, JSON.stringify(out));

// ---------- self-check ----------
const back = JSON.parse(fs.readFileSync(dest, 'utf8'));
const ids = new Set(back.elements.nodes.map(n => n.data.id));
let badEdges = 0;
for (const e of back.elements.edges) if (!ids.has(e.data.source) || !ids.has(e.data.target)) badEdges++;
const dupeIds = back.elements.nodes.length !== ids.size;
console.log(`data.cyjs: ${back.elements.nodes.length} nodes, ${back.elements.edges.length} edges, ${(fs.statSync(dest).size / 1048576).toFixed(1)} MB`);
console.log(`  dropped edges (dangling endpoints): ${droppedEdges}`);
console.log(`  edge id/target check: ${badEdges === 0 ? 'OK' : badEdges + ' BAD'}`);
console.log(`  unique node ids: ${dupeIds ? 'FAIL — duplicates!' : 'OK'}`);
console.log(`  interactions: ${JSON.stringify([...edges.reduce((m, e) => m.set(e.data.interaction, (m.get(e.data.interaction) || 0) + 1), new Map())])}`);
console.log(`  layered depths: ${byLayer.size} layers, widest ${Math.max(...[...byLayer.values()].map(a => a.length))} nodes`);
if (badEdges || dupeIds || droppedEdges) process.exit(1);
