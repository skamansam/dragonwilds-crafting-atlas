// Builds site/data.js — the complete dataset used by the explorer website.
import fs from 'node:fs';
import path from 'node:path';

const parsed = JSON.parse(fs.readFileSync(new URL('../cache/parsed/dataset.json', import.meta.url).pathname, 'utf8'));
const iconManifest = JSON.parse(fs.readFileSync(new URL('../cache/icons/manifest.json', import.meta.url).pathname, 'utf8'));

// ---------- dedupe recipes ----------
const rkey = r => [r.output, r.inputs.map(i => i.name + ':' + i.qty).join(','), r.facility, r.blueprint, r.variant].join('|');
const recipeMap = new Map();
for (const r of parsed.recipes) {
  const k = rkey(r);
  if (!recipeMap.has(k)) recipeMap.set(k, r);
}
const recipes = [...recipeMap.values()];
console.log('recipes:', recipes.length);

// ---------- canonical names + nodes ----------
const iconFor = (name) => iconManifest[name] || iconManifest[name + '.png'] || null;
const CANONICAL_SKILLS = new Set(['Attack', 'Magic', 'Ranged', 'Mining', 'Woodcutting', 'Farming', 'Fishing', 'Runecrafting', 'Construction', 'Artisan', 'Cooking', 'Agility']);
const nodeIndex = new Map();

function ensureNode(name, patch = {}) {
  const key = name;
  if (nodeIndex.has(key)) {
    const n = nodeIndex.get(key);
    Object.assign(n, Object.fromEntries(Object.entries(patch).filter(([k, v]) => v != null && n[k] == null)));
    return n;
  }
  const n = { id: name, name, ...patch };
  nodeIndex.set(key, n);
  return n;
}

for (const it of parsed.items) ensureNode(it.name, { kind: it.type, itemType: it.itemType, image: it.image, description: it.description, stats: it.stats, weight: it.weight, stacklimit: it.stacklimit, repaircost: it.repaircost, pageid: it.pageid });
for (const st of parsed.stations) ensureNode(st.name, { kind: 'station', itemType: 'Station', image: st.image, description: st.description, catalogue: st.catalogue, pageid: st.pageid });
// spell nodes: rune ingredients feed the spell
const spellEdges = [];
for (const sp of parsed.spells) {
  ensureNode(sp.name, { kind: 'spell', itemType: 'Spell', image: sp.image, description: sp.description, pageid: sp.pageid });
  for (const [r, q] of Object.entries(sp.runes || {})) {
    let runeName = /rune$/i.test(r) ? r : r + ' Rune';
    // match canonical capitalisation used by the wiki (e.g. "Air Rune")
    if (!iconFor(runeName)) {
      const alt = runeName.replace(/\bRune\b/i, 'rune');
      if (iconFor(alt)) runeName = alt;
    }
    ensureNode(runeName, { kind: 'implicit', itemType: 'Rune' });
    spellEdges.push({ from: runeName, to: sp.name, qty: q, facility: 'Cast', skill: sp.skill, xp: null, blueprint: null, variant: null, deprecated: false, source: sp.name });
  }
}

// skill nodes: recipes/spells requiring the skill get an edge skill -> target
// so the skill tree becomes part of the graph.
const skillEdges = [];
const skillNodeNames = new Set();
for (const sp of parsed.spells) {
  if (sp.skill && CANONICAL_SKILLS.has(sp.skill)) {
    skillNodeNames.add(sp.skill);
    skillEdges.push({ from: sp.skill, to: sp.name, qty: (sp.level || 1), facility: `Level ${sp.level || '?'}`, skill: sp.skill, xp: null, blueprint: null, variant: null, deprecated: false, source: sp.name });
  }
}
for (const r of recipes) {
  if (r.skill && CANONICAL_SKILLS.has(r.skill)) {
    skillNodeNames.add(r.skill);
    skillEdges.push({ from: r.skill, to: r.output, qty: null, facility: r.facility, skill: r.skill, xp: r.xp, blueprint: r.blueprint, variant: r.variant, deprecated: r.deprecated, source: r.source });
  }
}
for (const name of CANONICAL_SKILLS) {
  const sp = parsed.skills.find(s => s.name === name);
  ensureNode(name, { kind: 'skill', itemType: 'Skill', image: sp ? sp.image : null, description: sp ? sp.description : [], pageid: sp ? sp.pageid : null });
}

// implicit nodes: referenced or recipe outputs with no page
const named = new Set(nodeIndex.keys());
for (const r of recipes) {
  if (!named.has(r.output)) ensureNode(r.output, { kind: 'implicit', itemType: 'Building / Item' });
  for (const i of r.inputs) if (!named.has(i.name)) ensureNode(i.name, { kind: 'implicit', itemType: 'Material' });
}
for (const n of parsed.referencedNames) if (!nodeIndex.has(n)) ensureNode(n, { kind: 'implicit', itemType: 'Reference' });

// ---------- edges from recipes ----------
const edges = [...spellEdges, ...skillEdges];
for (const r of recipes) {
  for (const inp of r.inputs) {
    edges.push({
      from: inp.name,           // material -> product
      to: r.output,
      qty: inp.qty,
      facility: r.facility,
      skill: r.skill,
      xp: r.xp,
      blueprint: r.blueprint,
      variant: r.variant,
      deprecated: r.deprecated,
      source: r.source,
    });
  }
}
console.log('edges:', edges.length);

// ---------- skills & spells ----------
const skills = parsed.skills.filter(s => CANONICAL_SKILLS.has(s.name)).map(s => ({
  name: s.name, image: s.image, icon: iconFor(s.image), description: s.description,
  unlocks: (parsed.levelUnlocks[s.name] || []).map(u => ({ level: u.level, text: u.raw, items: u.unlocks })),
})).sort((a, b) => a.name.localeCompare(b.name));

const spells = parsed.spells.map(s => ({ ...s, icon: iconFor(s.image) })).sort((a, b) => (a.skill || '').localeCompare(b.skill || '') || (a.level || 0) - (b.level || 0));

// skill levels required per node: from skill level-up tables (spells) —
// also map which items appear as unlock rewards
const skillLevelForItem = {}; // itemName -> [{skill, level, text}]
for (const s of skills) {
  for (const u of s.unlocks) {
    for (const it of u.items) {
      if (!skillLevelForItem[it]) skillLevelForItem[it] = [];
      skillLevelForItem[it].push({ skill: s.name, level: u.level, text: u.text });
    }
  }
}

// ---------- nodes output ----------
const nodes = [...nodeIndex.values()].map(n => {
  const icon = n.image ? iconFor(n.image) : iconFor(n.name);
  return {
    id: n.id, name: n.name, kind: n.kind || 'other', itemType: n.itemType || '',
    icon,
    // deep link only for nodes backed by a real wiki page (TICKET-06);
    // implicit/variant nodes have no page, so no link is fabricated.
    // (the 12 canonical skills are real scraped pages even though their
    //  parsed records carry no pageid)
    wiki: (n.pageid != null || n.kind === 'skill')
      ? 'https://dragonwilds.runescape.wiki/w/' + encodeURIComponent(n.name.replace(/ /g, '_'))
      : null,
    description: n.description || [],
    stats: n.stats || null,
    weight: n.weight || null, stacklimit: n.stacklimit || null,
    repaircost: n.repaircost && n.repaircost.length ? n.repaircost : null,
    catalogue: n.catalogue || null,
    pageid: n.pageid || null,
  };
});

const dataset = {
  generatedAt: parsed.generatedAt,
  source: 'https://dragonwilds.runescape.wiki',
  nodes,
  edges,
  recipes: recipes.map(r => ({ ...r, id: rkey(r) })),
  spells,
  skills,
  skillLevelForItem,
};
fs.mkdirSync(new URL('../site/', import.meta.url).pathname, { recursive: true });
fs.writeFileSync(new URL('../site/data.js', import.meta.url).pathname,
  'window.DW_DATA = ' + JSON.stringify(dataset) + ';');
fs.writeFileSync(new URL('../cache/final-dataset.json', import.meta.url).pathname, JSON.stringify(dataset, null, 1));

console.log('nodes:', nodes.length);
console.log('spells:', spells.length, 'skills:', skills.length);
const sizes = fs.statSync(new URL('../site/data.js', import.meta.url).pathname).size;
console.log('data.js size:', (sizes / 1024 / 1024).toFixed(2), 'MB');
