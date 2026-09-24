// Builds docs/checklists/*.md — per gather-method checklists of items whose
// location is missing or incomplete in site/found-in.js, so a human can play
// through, note where things are actually found, and hand the list back.
//
// Files (one per gather method, plus two catch-alls):
//   mined.md chopped.md picked.md farmed.md caught.md chest.md dungeon.md
//   drops.md unknown-source.md  (no annotation at all)
//   partial-locations.md        (has a method but missing region — fill that in)
//
// Each entry is a markdown checkbox with: item name, kind, wiki link, and the
// current best guess (existing method-only annotation or "unknown"). Regions to
// choose from are listed once per file header. Regenerate:
//   node scripts/build-location-checklists.mjs
//
// Deterministic output (method files sorted by item id, unknown-source sorted by
// likely in-game progression) so re-runs diff cleanly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// site/data.json — strict JSON dataset (nodes/edges/skills)
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data.json'), 'utf8'));

// site/found-in.js — window.DW_FOUND_IN = { itemId: [{ region, method, tool }] }
const fctx = { window: {} };
vm: {
  // eslint-disable-next-line no-undef
  const vmmod = await import('node:vm');
  fctx.vm = vmmod; // not needed by the file, but harmless
  vmmod.createContext(fctx);
  vmmod.runInContext(fs.readFileSync(path.join(ROOT, 'site/found-in.js'), 'utf8'), fctx);
}
const FI = fctx.window.DW_FOUND_IN || {};

// Items that can NOT be gathered (produced by a recipe) are excluded — every
// non-craftable node is a "foundable" candidate. Skills/spells/stations are
// their own thing and never drop.
const SKILL_NAMES = new Set((D.skills || []).map(s => s.name));
const inDegree = new Map();
for (const e of D.edges) {
  if (SKILL_NAMES.has(e.from)) continue;
  inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
}
const NOT_GATHERABLE_KINDS = new Set(['skill', 'spell', 'station']);
const nodeById = new Map(D.nodes.map(n => [n.id, n]));
const foundable = D.nodes.filter(n => !inDegree.get(n.id) && !NOT_GATHERABLE_KINDS.has(n.kind));

const REGIONS = ['Temple Woods', 'Bramblemead Valley', 'Fractured Plains', 'Bloodblight Swamp', 'Whispering Swamp', 'Ghornfell', 'Bleakfields Valley', 'Ashenfall (whole world)'];

const METHOD_LABEL = {
  mined: 'Mined (pickaxe)',
  chopped: 'Chopped (logging axe)',
  picked: 'Picked / collected',
  farmed: 'Farmed (farming plot)',
  caught: 'Fished / trapped',
  chest: 'Chest loot',
  dungeon: 'Dungeon / vault',
  drops: 'Monster drop',
  other: 'Other (unclear method)',
};

const wikiURL = n => n.wiki || (n.pageid ? `https://dragonwilds.runescape.wiki/w/Special:Redirect/page/${n.pageid}` : null);

// ---------------------------------------------------------------------------
// Progression order for unknown-source.md — "likely in-game progression".
// The dataset has no numeric level gates (recipe `level` fields are absent and
// skillLevelForItem only covers spells), so this is a hand-tuned heuristic:
// early-game gatherables sort to the top, late-game materials next, then
// quest/lore/cosmetic artefacts, with the skills of the recipes that consume
// the item as a tiebreak. Items are grouped under their tier heading; scores
// are unique per heading so every heading appears exactly once, contiguous.
// ---------------------------------------------------------------------------
const METAL_TIER = { copper: 0, bronze: 100, tin: 200, iron: 300, steel: 400, silver: 500, gold: 600, mithril: 700, runite: 800, dragon: 900 };
const ZONE_TIER = [ // sub-regions as they gate in the main quest
  ['temple', 0], ['bramble', 100], ['meadow', 100], ['plains', 200], ['fractured', 200],
  ['bloodblight', 300], ['whispering', 300], ['swamp', 300], ['ghornfell', 400], ['bleakfields', 500],
];
// classic RS herb ladder — the very first things a new character picks
const HERB_RE = /\b(guam|marrentill|tarromin|harralander|ranarr|irit|avantoe|kwuarm|snapdragon|cadantine|lantadyme|dwarf weed)\b/i;
// lore / quest / cosmetic artefact patterns → their bucket score
const ARTEFACT_PATTERNS = [
  [/\bvestige\b/i, 'lore & relics', 4000],
  [/\b(tome|engram|relic)\b/i, 'lore & relics', 4000],
  [/\b(skillcape|skill cape|cape|banner|mount|wigs?|mask|head[1-3])\b/i, 'cosmetics', 4200],
];
const GROUP_HEADING = {
  'metal tier': 'Metal-tier names', 'zone names': 'Zone-gated names', 'raw gatherables': 'Raw gatherables',
  materials: 'Materials', 'monster drops': 'Monster-drop materials & packs', usables: 'Usables (potions, food, gear…)',
  'lore & relics': 'Lore & relics', cosmetics: 'Cosmetics & capes', 'quest & rewards': 'Quest & reward items', unclassified: 'Unclassified',
};

// consumers: item -> products; and the recipes producing those products (for
// the skill tiebreak). Craft edges out of the item, recipes carry the skill.
const recByOut = new Map();
for (const r of D.recipes || []) {
  if (!recByOut.has(r.output)) recByOut.set(r.output, []);
  recByOut.get(r.output).push(r);
}
const consumerSkills = id => {
  const sk = new Set();
  for (const e of D.edges) {
    if (e.from !== id || SKILL_NAMES.has(e.from)) continue;
    for (const r of recByOut.get(e.to) || []) if (r.skill) sk.add(r.skill);
  }
  return sk;
};

// ---- skill ladder: a rough in-game training order (alphabetical would put
// Agility first and Woodcutting last, which is backwards for progression) ----
const SKILL_ORDER = [
  'Attack', 'Woodcutting', 'Mining', 'Cooking', 'Fishing', 'Farming',
  'Magic', 'Ranged', 'Construction', 'Artisan', 'Runecrafting', 'Agility',
];
const skillRank = sk => { const i = SKILL_ORDER.indexOf(sk); return i < 0 ? SKILL_ORDER.length : i; };

function progressionKey(n) {
  const name = n.id || '';
  const type = n.itemType || '';
  const low = name.toLowerCase();

  // quest/reward items first — they can carry metal words ("Reward Pack: … Bronze")
  if (/\breward pack\b/i.test(name) || /\bquest\b/i.test(type)) return { score: 5000, group: 'quest & rewards' };
  // Tier 0-900: named metals — the game's classic ore/bar ladder. Only when the
  // metal leads the name ("Bronze Salvage Pile", "Dragon Blood") — mid-name
  // metals are flavour ("A Cracked Bronze Vanity Mirror" → lore).
  for (const [metal, t] of Object.entries(METAL_TIER)) {
    if (new RegExp(`^${metal}\\b`, 'i').test(name) && (['material', 'resource'].includes(n.kind) || /\b(bar|ore|salvage|pile)\b/i.test(name))) return { score: t, group: 'metal tier' };
  }
  // 1000-1500: zone-gated flora/fauna/sub-regions
  for (const [frag, t] of ZONE_TIER) if (low.includes(frag)) return { score: 1000 + t, group: 'zone names' };
  // 1600: gatherable raws (the useful stuff to locate early)
  if (HERB_RE.test(name) || /\b(plant|seed|berry|berries|root|herb|leaf|flower|mushroom|egg|feather|antler|steak|meat|wine|vial|cabbage|weed|lily|bark)\b/i.test(name)) return { score: 1600, group: 'raw gatherables' };
  // 1700: general materials/resources
  if (['material', 'resource'].includes(n.kind) || /material|resource|component|ingredient/i.test(type)) return { score: 1700, group: 'materials' };
  // 2000: monster-drop materials (hides, bones, scales, salvage piles…)
  if (/\b(hide|fang|bone|scale|ichor|ashes?|scrap|salvage|pile|essence|shard|crystal|visage|heart|cotton|chitin|carapace|appendage|sphere|fibre|fiber|pack)\b/i.test(name)) return { score: 2000, group: 'monster drops' };
  // lore / quest / cosmetic artefacts
  for (const [re, group, score] of ARTEFACT_PATTERNS) if (re.test(name) || re.test(type)) return { score, group };
  // 2500: potions/food/trinkets/ammo/gear are usable mid-game
  if (['potion', 'food', 'drink', 'trinket', 'ammo', 'weapon', 'armour'].includes(n.kind)) return { score: 2500, group: 'usables' };
  return { score: 6000, group: 'unclassified' };
}

function progressionSort(unknownList) {
  const scored = unknownList.map(n => {
    const { score, group } = progressionKey(n);
    const sk = consumerSkills(n.id);
    const skRank = sk.size ? Math.min(...[...sk].map(skillRank)) : SKILL_ORDER.length + 1;
    return { n, score, group, skRank };
  });
  scored.sort((a, b) => a.score - b.score || a.skRank - b.skRank || a.n.id.localeCompare(b.n.id));
  return scored;
}

function entryLine(n, current) {
  const bits = [`- [ ] **${n.id}**`];
  bits.push(`*${n.itemType || n.kind}*`);
  const url = wikiURL(n);
  if (url) bits.push(`[wiki](${url})`);
  bits.push(current ? `— currently: *${current}*` : '— currently: **no source info**');
  return bits.join(' · ');
}

// current best guess shown on the line (only when it lacks a region)
function currentGuess(id) {
  const fi = FI[id] || [];
  if (!fi.length) return null;
  const parts = fi.map(f => `${METHOD_LABEL[f.method] || f.method}${f.tool ? ` (${f.tool})` : ''}${f.region ? ` @ ${f.region}` : ''}`);
  return parts.join('; ');
}

// classify every foundable item
const byMethod = new Map(); // method -> [{n, fi}]
const unknown = [];
const partial = []; // annotated but at least one entry lacks a region
for (const n of foundable) {
  const fi = FI[n.id] || [];
  if (!fi.length) { unknown.push(n); continue; }
  if (fi.some(f => !f.region)) {
    partial.push({ n, fi });
    // also list it under its primary method file as a partial
    const m = fi.find(f => f.method) || { method: 'other' };
    if (!byMethod.has(m.method)) byMethod.set(m.method, []);
    byMethod.get(m.method).push({ n, fi, partial: true });
  }
  for (const f of fi) {
    if (f.region) continue; // fully located on this entry
    if (!byMethod.has(f.method)) byMethod.set(f.method, []);
    // (first hit above already pushed; avoid double-push for the same node)
    if (!byMethod.get(f.method).some(x => x.n.id === n.id)) byMethod.get(f.method).push({ n, fi, partial: true });
  }
}
// method-only items with NO region anywhere go in their method file as the main list
for (const n of foundable) {
  const fi = FI[n.id] || [];
  if (!fi.length || fi.some(f => f.region)) continue; // unknown or partial handled above
  const m = fi[0];
  if (!byMethod.has(m.method)) byMethod.set(m.method, []);
  byMethod.get(m.method).push({ n, fi, partial: false });
}

const OUT_DIR = path.join(ROOT, 'docs/checklists');
fs.mkdirSync(OUT_DIR, { recursive: true });

const header = (title, intro, items, extra = '') => `# ${title}

${intro}

**Regions you can cite:** ${REGIONS.map(r => `\`${r}\``).join(' · ')}

${extra}**${items.length} item${items.length === 1 ? '' : 's'}** need a location below. Tick the box once the wiki-worthy source is known, and write it on the line: \`— found in: <region>, <how>\`.

`;

const files = [];

// per-method files
for (const [method, list] of [...byMethod.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const label = METHOD_LABEL[method] || method;
  const uniq = [...new Map(list.map(x => [x.n.id, x])).values()].sort((a, b) => a.n.id.localeCompare(b.n.id));
  const intro = `Items the wiki prose already ties to **${label.toLowerCase()}** but whose ${'`region`'} is missing. If you find one somewhere else, say so — the annotation accepts multiple regions.`;
  let md = header(`${label} — missing regions`, intro, uniq);
  md += uniq.map(({ n, fi }) => entryLine(n, currentGuess(n.id))).join('\n') + '\n';
  const file = path.join(OUT_DIR, `${method}.md`);
  fs.writeFileSync(file, md);
  files.push([file, uniq.length]);
}

// unknown-source catch-all — sorted by likely in-game progression, then
// grouped under progression-tier headings (metal tier → zone tier → raw
// gatherables → materials → drop mats → usables → lore → quest → unknown)
{
  const scored = progressionSort(unknown);
  const intro = `Items with **no source annotation at all** — the wiki prose never said where they come from (or the parser couldn't tell). Note both the method and the region.\n\nSorted by **likely in-game progression** (early-game gatherables first, lore/quest items last); a heuristic — name patterns, metal/zone tiers and what recipes consume the item, since the dataset carries no level gates.`;
  let md = header('Unknown source — needs method + region', intro, scored);
  // group under progression-tier headings for quicker in-game lookup
  let cur = null;
  for (const { n, group } of scored) {
    if (group !== cur) { cur = group; md += `\n## ${GROUP_HEADING[group] || group}\n\n`; }
    md += entryLine(n, null) + '\n';
  }
  const file = path.join(OUT_DIR, 'unknown-source.md');
  fs.writeFileSync(file, md);
  files.push([file, scored.length]);
}

// partial-locations cross-view: annotated, but at least one entry lacks a region
const partSorted = partial.sort((a, b) => a.n.id.localeCompare(b.n.id));
{
  const intro = `Items that **have some location info but not enough** — every line below is missing at least one ${'`region`'}. The item may also appear in a method file.`;
  let md = header('Partial locations — needs the missing region(s)', intro, partSorted);
  md += partSorted.map(({ n, fi }) => {
    const have = fi.filter(f => f.region).map(f => `${METHOD_LABEL[f.method] || f.method} @ ${f.region}`).join('; ') || 'nothing pinned yet';
    return `- [ ] **${n.id}** — have: *${have}* — still needed: ${fi.filter(f => !f.region).map(f => METHOD_LABEL[f.method] || f.method).join(', ') || 'a region for the current guess'}`;
  }).join('\n') + '\n';
  const file = path.join(OUT_DIR, 'partial-locations.md');
  fs.writeFileSync(file, md);
  files.push([file, partSorted.length]);
}

// summary
let total = 0;
console.log('checklists written to docs/checklists/:');
for (const [file, count] of files) { console.log(`  ${path.basename(file).padEnd(22)} ${String(count).padStart(4)} items`); total += count; }
console.log(`  (${total} checklist lines across ${files.length} files; ${unknown.length} fully unannotated, ${partSorted.length} partial)`);

// sanity: every foundable accounted for exactly once across unknown + partial + fully-located
const located = foundable.filter(n => (FI[n.id] || []).length && (FI[n.id] || []).every(f => f.region)).length;
if (unknown.length + partSorted.length + located !== foundable.length) {
  console.error(`ACCOUNTING MISMATCH: unknown ${unknown.length} + partial ${partSorted.length} + located ${located} != foundable ${foundable.length}`);
  process.exit(1);
}
console.log(`accounting OK: ${unknown.length} unknown + ${partSorted.length} partial + ${located} fully located = ${foundable.length} foundable`);
