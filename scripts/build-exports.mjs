// Builds the Cytoscape export bundle from window.DW_DATA:
//   public/data.cyjs     — Cytoscape.js JSON network, array style (Desktop 3.1+,
//                        manual §7.2; import via File ▸ Import ▸ Network ▸ File)
//   public/data.graphml  — GraphML (wider tool compatibility: yEd, Gephi, NetworkX,
//                        igraph, Cytoscape itself; typed keys, NMTOKEN-safe ids)
//   public/atlas-style.xml — vizmap XML style for Cytoscape Desktop (manual §12):
//                        nodes colored/shaped by `kind`, edges by `interaction`.
//                        Import via File ▸ Import ▸ Style from File…, then select
//                        the style "Dragonwilds Atlas".
//
// Node ids are item/station/skill/spell names (the atlas' own ids, so panels
// and wiki links stay joinable). Every DW_DATA field becomes a table column;
// edges carry qty/facility/skill/xp plus an `interaction` column:
//   craft       — recipe input edge (facility = the station that consumes it)
//   spell       — spell cast cost (e.g. Air Rune → Windstep)
//   skill-gate  — skill unlock edge (source is a skill node)
// A deterministic layered seed layout (primary-recipe depth, raw materials at
// the bottom) is baked into node positions; re-layout any time.
//
// Region pseudo-nodes (P4-1b) are exported as a separate node class so Desktop
// users can style/filter them: kind=region hubs with `foundHere` method lists,
// joined to member items by interaction=region edges (source = region hub).
// They mirror the web app's build-from-DW_FOUND_IN hubs (app.js) and are NOT
// part of DW_DATA — plans, paths and recipe counts stay recipe-only.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// public/data.js is a plain `window.DW_DATA = {...}` object literal — eval it.
// public/found-in.js (window.DW_FOUND_IN) is optional: region hubs only export
// when it exists.
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/data.js'), 'utf8'), ctx);
const D = ctx.window.DW_DATA;
// public/found-in.js (window.DW_FOUND_IN), public/quests.js (window.DW_QUESTS) and
// public/mounts.js (window.DW_MOUNTS) are optional overlays: region hubs export
// only when found-in exists, the quest layer only when quests.js exists.
const overlay = (file, key) => {
  try {
    const c = { window: {} };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), c);
    return c.window[key] || null;
  } catch { return null; }
};
const FI = overlay('public/found-in.js', 'DW_FOUND_IN');
const Q = overlay('public/quests.js', 'DW_QUESTS');
const M = overlay('public/mounts.js', 'DW_MOUNTS');

const idSet = new Set(D.nodes.map(n => n.id));
const skillNames = new Set((D.skills || []).map(s => s.name));

// ---------- shared: nodes & edges (normalized model) ----------
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

// ---------- shared: deterministic layered seed layout ----------
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

// ---------- region pseudo-nodes (P4-1b) ----------
// Canonical Ashenfall regions become kind=region hubs with interaction=region
// spokes to member items. Deterministic order: canonical region list, then
// member items sorted. Hubs sit at the centroid of their laid-out members.
// Full Ashenfall location list (dragonwilds wiki page order — the same list the
// hand-annotation checklists use). Exports only emit hubs for regions that
// actually appear in found-in data, so new locations light up as they're
// annotated; the app (src/app.js) keeps its own identical copy.
const CANON_REGIONS = [
  // other divisions (never found-in values, kept out): the north, the far north,
  // the mountainous reach, the far south-east
  'Temple Woods', 'Bramblemead Valley', 'Whispering Swamp', 'Ghornfell',
  'Fractured Plains', 'Bloodblight Swamp', 'Stormtouched Highlands',
  'Fellhollow', 'Bleakfields Valley', 'Forgotten Temple', "Dragon's Run",
  'Emberwood', 'Witchwillow Range', "Hope's Fall", 'Lake of Lost Souls',
  'Silverthorn Keep', 'Coalridge Pass', 'Dowdun Reach', 'The Approach',
  'The Courtyard', 'The Nexus', 'The Library', 'The Grand Hall', 'The Garrison',
  'The Pastures', 'The Menagerie', 'The Bastion', 'Umbral Sands',
  'Alcarrid Oasis', 'Dunes of Uzzer', 'Manafem Plains', 'The Burning Spire',
  // quest-only regions (P7): named by the Quests page, never by location prose
  'Brynmoor', 'Scorned Wilderness',
];
const METHOD_LABEL = {
  mined: 'mined', chopped: 'chopped', picked: 'picked', farmed: 'farmed',
  caught: 'fished', drops: 'drops', chest: 'in chests', dungeon: 'in dungeons', other: 'found',
};
const posById = new Map(nodes.map(n => [n.data.id, n.position]));
const regionMembers = new Map(); // region -> Map(item -> Set(method))
for (const [item, list] of Object.entries(FI || {})) {
  for (const f of list) {
    if (!f.region || !CANON_REGIONS.includes(f.region)) continue;
    if (!regionMembers.has(f.region)) regionMembers.set(f.region, new Map());
    const m = regionMembers.get(f.region);
    if (!m.has(item)) m.set(item, new Set());
    m.get(item).add(METHOD_LABEL[f.method] || f.method || 'found');
  }
}

// ---------- quest layer (P7) ----------
// The same overlay src/app.js synthesizes at boot: one hub per region that has
// finds OR a quest set in it, a node per quest (kind=quest, NOT in DW_DATA), and
// region → quest → reward spokes. Mount nodes already live in DW_DATA.
const regionQuests = new Map(); // region -> [quest name]
const questById = new Map();
for (const name of ((Q && Q.order) || [])) {
  const q = Q.quests[name];
  if (!q) continue;
  questById.set(name, q);
  for (const r of q.regions || []) {
    if (!regionQuests.has(r)) regionQuests.set(r, []);
    regionQuests.get(r).push(name);
  }
}
const hubPos = new Map(); // region -> position (for seeding its quests)
let loneHub = 0;
for (const region of CANON_REGIONS) {
  const members = regionMembers.get(region) || new Map();
  const quests = regionQuests.get(region) || [];
  if (!members.size && !quests.length) continue; // empty region → no hub (matches the app)
  const items = [...members.keys()].sort();
  let sx = 0, sy = 0;
  for (const it of items) { const p = posById.get(it); sx += p.x; sy += p.y; }
  const position = items.length
    ? { x: Math.round(sx / items.length), y: Math.round(sy / items.length) }
    : { x: loneHub++ * 420, y: -LAYER_H * 2 }; // quest-only region — no centroid to use
  hubPos.set(region, position);
  posById.set(region, position);
  const bits = [];
  if (items.length) bits.push(`${items.length} annotated finds`);
  if (quests.length) bits.push(`${quests.length} quest${quests.length > 1 ? 's' : ''}`);
  nodes.push({
    selected: false,
    data: {
      id: region,
      name: region,
      shared_name: region,
      kind: 'region',
      itemType: null,
      category: 'region',
      wiki: null,
      pageid: null,
      weight: null,
      stacklimit: null,
      repaircost: null,
      catalogue: null,
      description: `Region of Ashenfall - ${bits.join(' · ')} (from the wiki's location prose and quest tables; a map aid, not a crafting step)`,
      stats: null,
      icon: null,
      foundHere: items.length ? items.map(it => `${it} (${[...members.get(it)].sort().join(', ')})`).join('; ') : null,
      questsHere: quests.length ? quests.slice().sort().join('; ') : null,
    },
    position,
  });
  for (const it of items) edges.push(regionEdge(region, it));
}

const QUEST_EDGES = [];
let qi = 0;
for (const [name, q] of questById) {
  const rewards = (q.rewards || []).map(r => r.item).filter(it => posById.has(it));
  const hubs = (q.regions || []).filter(r => hubPos.has(r));
  let x = 0, y = 0, n = 0;
  for (const it of rewards) { const p = posById.get(it); x += p.x; y += p.y; n++; }
  for (const r of hubs) { const p = hubPos.get(r); x += p.x; y += p.y; n++; }
  const position = n
    ? { x: Math.round(x / n), y: Math.round(y / n) - 160 } // between its region and its rewards
    : { x: loneHub * 420 + qi * 60, y: -LAYER_H * 2 - 200 };
  qi++;
  posById.set(name, position);
  nodes.push({
    selected: false,
    data: {
      id: name,
      name,
      shared_name: name,
      kind: 'quest',
      itemType: null,
      category: 'quest',
      wiki: null,
      pageid: null,
      weight: null,
      stacklimit: null,
      repaircost: null,
      catalogue: null,
      description: q.whereToStart || null,
      stats: null,
      icon: null,
      tier: q.tier || null,
      whereToStart: q.whereToStart || null,
      rewards: (q.rewards || []).map(r => r.item).join('; ') || null,
    },
    position,
  });
  for (const region of hubs) QUEST_EDGES.push({ id: `${region} -> ${name}`, source: region, target: name, interaction: 'quest', label: `${region} (quest here) ${name}`, kind: 'region' });
  for (const r of (q.rewards || [])) {
    if (!posById.has(r.item)) continue;
    QUEST_EDGES.push({ id: `${name} -> ${r.item}`, source: name, target: r.item, interaction: 'quest', label: `${name} (rewards) ${r.item}`, kind: 'reward' });
  }
}
// quest → mount: the Mount page's requirements column, violet in the app (same layer)
for (const [mountId, m] of Object.entries((M && M.mounts) || {})) {
  if (!posById.has(mountId)) continue;
  for (const quest of m.quests || []) {
    if (!questById.has(quest)) continue;
    QUEST_EDGES.push({ id: `${quest} -> ${mountId}`, source: quest, target: mountId, interaction: 'mount', label: `${quest} (unlocks mount) ${mountId}`, kind: 'mount' });
  }
}
for (const qe of QUEST_EDGES) {
  edges.push({
    selected: false,
    data: {
      id: `q${edges.length}`,
      source: qe.source,
      target: qe.target,
      interaction: qe.interaction,
      shared_interaction: qe.interaction,
      name: qe.label,
      shared_name: qe.label,
      qty: null,
      facility: null,
      skill: null,
      xp: null,
      blueprint: null,
      variant: null,
      deprecated: false,
      sourceRecipe: null,
    },
  });
}

// a region → item 'found here' spoke (shared by both hubs)
function regionEdge(region, item) {
  return {
    selected: false,
    data: {
      id: `r${edges.length}`,
      source: region,
      target: item,
      interaction: 'region',
      shared_interaction: 'region',
      name: `${region} (found here) ${item}`,
      shared_name: `${region} (found here) ${item}`,
      qty: null,
      facility: null,
      skill: null,
      xp: null,
      blueprint: null,
      variant: null,
      deprecated: false,
      sourceRecipe: null,
    },
  };
}

// ============================================================
// 1) data.cyjs — Cytoscape.js JSON (array style)
// ============================================================
const cyjs = {
  data: {
    id: 'dragonwilds-crafting-atlas',
    name: 'Dragonwilds Crafting Atlas',
    source: D.source,
    generatedAt: D.generatedAt,
    description: `All items, stations, skills and spells of RuneScape: Dragonwilds as one dependency graph. interaction: craft | spell | skill-gate${FI ? ' | region' : ''}${Q ? ' | quest | mount' : ''}. Nodes with kind=region are map-aid hubs (found-here groupings from the wiki's location prose); nodes with kind=quest are the quests themselves (region -> quest -> reward, from the wiki's Quests page). Neither is a crafting step.`,
  },
  elements: { nodes, edges },
};
const cyjsDest = path.join(ROOT, 'public/data.cyjs');
fs.writeFileSync(cyjsDest, JSON.stringify(cyjs));

// ============================================================
// 2) data.graphml — typed, NMTOKEN-safe ids
// ============================================================
const xmlEsc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// GraphML ids must be XML NMTOKENs: no spaces or most punctuation. Node ids
// are in-game names, so hash them (FNV-1a) and keep a name column.
// Built from the final `nodes` list — AFTER region hubs are appended — so hubs
// get their own ids (a nid lookup miss would collide every hub into `undefined`).
const nid = new Map(); // atlas id -> graphml node id
nodes.forEach((n, i) => nid.set(n.data.id, `n${i}`));

const nodeKeys = [
  ['kind', 'string'],
  ['itemType', 'string'],
  ['category', 'string'],
  ['wiki', 'string'],
  ['pageid', 'int'],
  ['weight', 'string'],
  ['stacklimit', 'string'],
  ['repaircost', 'string'],
  ['catalogue', 'string'],
  ['description', 'string'],
  ['stats', 'string'],
  ['icon', 'string'],
  ['x', 'double'],
  ['y', 'double'],
];
const edgeKeys = [
  ['interaction', 'string'],
  ['qty', 'double'],
  ['facility', 'string'],
  ['skill', 'string'],
  ['xp', 'double'],
  ['blueprint', 'string'],
  ['variant', 'string'],
  ['deprecated', 'boolean'],
  ['sourceRecipe', 'string'],
];
const regionNodeKeys = [
  // region-hub-only columns: everything found in the region ("item (methods)"
  // entries) and the quests set in it
  ['foundHere', 'string'],
  ['questsHere', 'string'],
];
const questNodeKeys = [
  // quest-node-only columns (P7)
  ['tier', 'string'],
  ['whereToStart', 'string'],
  ['rewards', 'string'],
];
const asNum = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const asText = v => (v === null || v === undefined ? null : String(v));

const keyLines = [
  '    <key id="d0" for="node" attr.name="name" attr.type="string"/>',
  ...nodeKeys.map(([n, t], i) => `    <key id="k${i}" for="node" attr.name="${n}" attr.type="${t}"/>`),
  ...regionNodeKeys.map(([n, t], i) => `    <key id="rk${i}" for="node" attr.name="${n}" attr.type="${t}"/>`),
  ...questNodeKeys.map(([n, t], i) => `    <key id="qk${i}" for="node" attr.name="${n}" attr.type="${t}"/>`),
  '    <key id="e0" for="edge" attr.name="name" attr.type="string"/>',
  ...edgeKeys.map(([n, t], i) => `    <key id="ek${i}" for="edge" attr.name="${n}" attr.type="${t}"/>`),
  '    <key id="g0" for="graph" attr.name="name" attr.type="string"/>',
  '    <key id="g1" for="graph" attr.name="generatedAt" attr.type="string"/>',
  '    <key id="g2" for="graph" attr.name="description" attr.type="string"/>',
];

const nodeLines = nodes.map(n => {
  const d = n.data;
  const vals = { ...d, x: n.position.x, y: n.position.y };
  const data = [];
  data.push(`        <data key="d0">${xmlEsc(d.name)}</data>`);
  nodeKeys.forEach(([name], i) => {
    let v = vals[name];
    if (name === 'pageid') v = asNum(v);
    else if (name === 'x' || name === 'y') v = Number(v);
    else v = asText(v);
    if (v === null) return;
    data.push(`        <data key="k${i}">${typeof v === 'number' ? v : xmlEsc(v)}</data>`);
  });
  regionNodeKeys.forEach(([name], i) => {
    const v = asText(vals[name]);
    if (v === null) return;
    data.push(`        <data key="rk${i}">${xmlEsc(v)}</data>`);
  });
  questNodeKeys.forEach(([name], i) => {
    const v = asText(vals[name]);
    if (v === null) return;
    data.push(`        <data key="qk${i}">${xmlEsc(v)}</data>`);
  });
  return `      <node id="${nid.get(d.id)}">\n${data.join('\n')}\n      </node>`;
});

let eid = 0;
const edgeLines = edges.map(e => {
  const d = e.data;
  const data = [`        <data key="e0">${xmlEsc(d.name)}</data>`];
  edgeKeys.forEach(([name], i) => {
    let v = d[name];
    if (name === 'qty' || name === 'xp') v = asNum(v);
    else if (name === 'deprecated') v = String(!!v);
    else v = asText(v);
    if (v === null) return;
    data.push(`        <data key="ek${i}">${typeof v === 'number' ? v : xmlEsc(v)}</data>`);
  });
  return `      <edge id="e${eid++}" source="${nid.get(d.source)}" target="${nid.get(d.target)}">\n${data.join('\n')}\n      </edge>`;
});

const graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">
${keyLines.join('\n')}
    <graph id="Dragonwilds Crafting Atlas" edgedefault="directed">
      <data key="g0">Dragonwilds Crafting Atlas</data>
      <data key="g1">${xmlEsc(D.generatedAt)}</data>
      <data key="g2">All items, stations, skills and spells of RuneScape: Dragonwilds as one dependency graph. interaction: craft | spell | skill-gate${FI ? ' | region' : ''}${Q ? ' | quest | mount' : ''}. Nodes with kind=region are map-aid hubs (found-here groupings from the wiki's location prose); nodes with kind=quest are the quests themselves (region -&gt; quest -&gt; reward, from the wiki's Quests page). Neither is a crafting step.</data>
${nodeLines.join('\n')}
${edgeLines.join('\n')}
    </graph>
</graphml>
`;
const gmlDest = path.join(ROOT, 'public/data.graphml');
fs.writeFileSync(gmlDest, graphml);

// ============================================================
// 3) atlas-style.xml — vizmap style for Desktop
// ============================================================
// Colors echo the web atlas: dark-vault canvas, runic gold, teal for owned.
const KIND_STYLE = [
  // [kind, fill, shape]  — shapes from the Ding enum used by vizmap
  ['resource', '#8fbf6a', 'ELLIPSE'],
  ['material', '#e2b95c', 'ELLIPSE'],
  ['station', '#7fa7c9', 'ROUND_RECTANGLE'],
  ['weapon', '#d96a5f', 'RECTANGLE'],
  ['armour', '#c98f6a', 'RECTANGLE'],
  ['tool', '#c9b47f', 'RECTANGLE'],
  ['ammo', '#b0a08a', 'RECTANGLE'],
  ['trinket', '#d9b3e2', 'DIAMOND'],
  ['food', '#a8c97f', 'ELLIPSE'],
  ['drink', '#9fc9c4', 'ELLIPSE'],
  ['potion', '#c96fa8', 'ELLIPSE'],
  ['spell', '#8f9fd9', 'HEXAGON'],
  ['skill', '#f7dd9a', 'OCTAGON'],
  ['implicit', '#6d6a5e', 'ELLIPSE'],
  ['other', '#a49d8c', 'ELLIPSE'],
  ['region', '#7fc9a6', 'HEXAGON'], // P4-1b region hubs — green hexagon
  ['quest', '#d9a13f', 'OCTAGON'], // P7 quest nodes — gold octagon
  ['mount', '#c9a0e0', 'ELLIPSE'], // P7 mounts — violet ellipse
];
const INT_STYLE = [
  // [interaction, stroke, line type, width]
  ['craft', '#c9a24a', 'SOLID', 2.0],
  ['spell', '#8f9fd9', 'LONG_DASH', 1.6],
  ['skill-gate', '#6d6a5e', 'DASH', 1.2],
  ['region', '#8cc8aa', 'DASH', 1.0], // found-here spokes — soft green dash
  ['quest', '#d9a13f', 'DASH', 1.6], // region → quest → reward spokes — gold dash
  ['mount', '#c9a0e0', 'DOT', 1.4], // quest → mount unlocks — violet dot
];

const vp = (name, def, inner = '') => `                <visualProperty default="${def}" name="${name}">${inner}</visualProperty>`;
const disc = (attr, entries, type = 'string') =>
  `                <discreteMapping attributeName="${attr}" attributeType="${type}">\n` +
  entries.map(([v, val]) => `                    <discreteMappingEntry attributeValue="${xmlEsc(v)}" value="${xmlEsc(val)}"/>`).join('\n') +
  `\n                </discreteMapping>`;

const styleXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<vizmap id="DragonwildsAtlas-VizMap" documentVersion="3.0">
    <visualStyle name="Dragonwilds Atlas">
        <network>
            <visualProperty default="#0a0c11" name="NETWORK_BACKGROUND_PAINT"/>
            <visualProperty default="true" name="NETWORK_NODE_SELECTION"/>
            <visualProperty default="true" name="NETWORK_EDGE_SELECTION"/>
        </network>
        <node>
            <dependency value="true" name="nodeSizeLocked"/>
            ${vp('NODE_FILL_COLOR', '#a49d8c', '\n' + disc('kind', KIND_STYLE.map(([k, f]) => [k, f])) + '\n            ')}
            ${vp('NODE_SHAPE', 'ELLIPSE', '\n' + disc('kind', KIND_STYLE.map(([k, , s]) => [k, s])) + '\n            ')}
            ${vp('NODE_BORDER_PAINT', '#0a0c11', '\n' + disc('kind', KIND_STYLE.map(([k]) => [k, '#0f1219'])) + '\n            ')}
            ${vp('NODE_BORDER_WIDTH', '2.0')}
            ${vp('NODE_WIDTH', '42.0')}
            ${vp('NODE_HEIGHT', '42.0')}
            ${vp('NODE_LABEL_COLOR', '#e9e4d6')}
            ${vp('NODE_LABEL_FONT_SIZE', '11')}
            ${vp('NODE_LABEL_POSITION', 'C,C,c,0.00,0.00')}
            ${vp('NODE_LABEL_TRANSPARENCY', '220')}
            ${vp('NODE_TRANSPARENCY', '235')}
            ${vp('NODE_LABEL', '', '\n' + `                <passthroughMapping attributeName="name" attributeType="string"/>` + '\n            ')}
        </node>
        <edge>
            ${vp('EDGE_STROKE_UNSELECTED_PAINT', '#c9a24a', '\n' + disc('interaction', INT_STYLE.map(([i, c]) => [i, c])) + '\n            ')}
            ${vp('EDGE_TARGET_ARROW_UNSELECTED_PAINT', '#c9a24a', '\n' + disc('interaction', INT_STYLE.map(([i, c]) => [i, c])) + '\n            ')}
            ${vp('EDGE_TARGET_ARROW_SHAPE', 'ARROW', '\n' + disc('interaction', [['craft', 'ARROW'], ['spell', 'ARROW'], ['skill-gate', 'DELTA']]) + '\n            ')}
            ${vp('EDGE_LINE_TYPE', 'SOLID', '\n' + disc('interaction', INT_STYLE.map(([i, , t]) => [i, t])) + '\n            ')}
            ${vp('EDGE_WIDTH', '2.0', '\n' + disc('interaction', INT_STYLE.map(([i, , , w]) => [i, String(w)]), 'string') + '\n            ')}
            ${vp('EDGE_TRANSPARENCY', '170')}
        </edge>
    </visualStyle>
</vizmap>
`;
const styleDest = path.join(ROOT, 'public/atlas-style.xml');
fs.writeFileSync(styleDest, styleXML);

// ============================================================
// self-checks
// ============================================================
const back = JSON.parse(fs.readFileSync(cyjsDest, 'utf8'));
const ids = new Set(back.elements.nodes.map(n => n.data.id));
let badEdges = 0;
for (const e of back.elements.edges) if (!ids.has(e.data.source) || !ids.has(e.data.target)) badEdges++;
const dupeIds = back.elements.nodes.length !== ids.size;

// XML well-formedness (both files) via DOMParser in a headless page
let xmlOK = null, gmlNodes = 0, gmlEdges = 0;
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  const p = await b.newPage();
  xmlOK = await p.evaluate(([sx, gx]) => {
    const dp = new DOMParser();
    const s = dp.parseFromString(sx, 'text/xml');
    const g = dp.parseFromString(gx, 'text/xml');
    const err = doc => doc.getElementsByTagName('parsererror').length ? 'PARSE ERROR' : 'OK';
    return {
      style: err(s), graphml: err(g),
      gnodes: g.getElementsByTagName('node').length,
      gedges: g.getElementsByTagName('edge').length,
      styles: s.getElementsByTagName('visualStyle').length,
      mappings: s.getElementsByTagName('discreteMapping').length,
    };
  }, [styleXML, graphml]);
  gmlNodes = xmlOK.gnodes; gmlEdges = xmlOK.gedges;
  await b.close();
} catch (e) {
  console.log('  (playwright XML check skipped:', e.message.split('\n')[0] + ')');
}

const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' MB';
console.log(`data.cyjs:      ${back.elements.nodes.length} nodes, ${back.elements.edges.length} edges, ${mb(cyjsDest)}`);
console.log(`data.graphml:   ${gmlNodes || nodes.length} nodes, ${gmlEdges || edges.length} edges, ${mb(gmlDest)}`);
console.log(`atlas-style.xml ${mb(styleDest)}: ${xmlOK ? xmlOK.styles + ' style, ' + xmlOK.mappings + ' discrete mappings (' + xmlOK.style + ', graphml ' + xmlOK.graphml + ')' : 'XML check skipped'}`);
console.log(`  dropped edges (dangling endpoints): ${droppedEdges}`);
console.log(`  cyjs integrity: ${badEdges === 0 && !dupeIds ? 'OK' : 'FAIL'}`);
console.log(`  interactions: ${JSON.stringify([...edges.reduce((m, e) => m.set(e.data.interaction, (m.get(e.data.interaction) || 0) + 1), new Map())])}`);
if (badEdges || dupeIds || droppedEdges) process.exit(1);
