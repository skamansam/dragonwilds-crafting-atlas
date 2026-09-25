// Builds docs/checklists/*.md — hand-annotation tables for items whose location
// is missing or incomplete in site/found-in.js, so a human can play through,
// note where things are actually found, and hand the data back.
//
// Two files:
//   needs-locations.md   annotated with a method but missing its region(s)
//   unknown-source.md    no source annotation at all (grouped by likely
//                        in-game progression, one table per tier)
//
// Table shape (one row per item):
//   Item | Wiki | How it's obtained | <every named Ashenfall location, in the
//   order of https://dragonwilds.runescape.wiki/w/Ashenfall> | Ashenfall (whole
//   world) | Notes
// Cells start blank (already-known regions come pre-ticked with `x`); the
// annotator adds an `x` per place the item was found, and free-form detail
// (which monster, which chest, which tool) in Notes.
//
// The "How it's obtained" wording is natural prose, enriched from the cached
// wiki pages where possible — e.g. drops say WHAT drops them ("killed from:
// cows, deer, wolves") rather than a bare "monster drop".
//
// Deterministic output so re-runs diff cleanly. Regenerate:
//   node scripts/build-location-checklists.mjs
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

// ---------------------------------------------------------------------------
// Citable locations — every named place on the Ashenfall wiki page, in page
// order (the five major divisions each followed by their territories, south →
// far north → the dragonkin reaches → the sands):
//   https://dragonwilds.runescape.wiki/w/Ashenfall
// The app's map hubs currently only know the 7 canonical regions; a merge-back
// script will have to map (or extend) before these reach found-in.js.
// ---------------------------------------------------------------------------
const ASHENFALL_LOCATIONS = [
  'Brynmoor',                       // division: the south
  'Temple Woods', 'Bramblemead Valley', 'Whispering Swamp',
  'Ghornfell',                      // division: the north
  'Fractured Plains', 'Bloodblight Swamp', 'Stormtouched Highlands',
  'Fellhollow',                     // division: the far north
  'Bleakfields Valley', 'Forgotten Temple', "Dragon's Run", 'Emberwood',
  'Witchwillow Range', "Hope's Fall", 'Lake of Lost Souls', 'Silverthorn Keep',
  'Coalridge Pass',
  'Dowdun Reach',                   // division: the mountainous reach
  'The Approach', 'The Courtyard', 'The Nexus', 'The Library', 'The Grand Hall',
  'The Garrison', 'The Pastures', 'The Menagerie', 'The Bastion',
  'Umbral Sands',                   // division: the far south-east
  'Alcarrid Oasis', 'Dunes of Uzzer', 'Manafem Plains', 'The Burning Spire',
  'Ashenfall (whole world)',        // no specific spot — found anywhere
];

// Natural "how it's obtained" wording per method key (found-in.js shape).
const HOW_LABEL = {
  mined: 'mined with a pickaxe',
  chopped: 'chopped with a logging axe',
  picked: 'picked / collected by hand',
  farmed: 'grown on a farming plot',
  caught: 'fished / trapped',
  chest: 'looted from chests',
  dungeon: 'found in dungeons & dragonkin vaults',
  drops: 'dropped by monsters',
  other: 'other (unclear method)',
};

const wikiURL = n => n.wiki || (n.pageid ? `https://dragonwilds.runescape.wiki/w/Special:Redirect/page/${n.pageid}` : null);
// [[Wolf|wolves]] → "wolves" (the pipe alias is the display text); [[cow]] → "cow"
const stripLinks = t => t.replace(/\[\[([^\]|]*)(\|([^\]]*))?\]\]/g, (_, target, _p, alias) => alias || target).replace(/'''?/g, '');

// --------------------------------------------------------------------------
// "How" enrichment — pull the drop source straight out of the cached wiki
// prose, so "Animal Hide" reads "killed from: cows, deer, wolves" instead of
// a bare "dropped by monsters". Only cached pages are consulted (no network).
// --------------------------------------------------------------------------
const rawCache = new Map(); // pageid → wikitext intro (lazy)
function introFor(n) {
  if (!n.pageid) return null;
  if (rawCache.has(n.pageid)) return rawCache.get(n.pageid);
  let intro = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'cache/raw', n.pageid + '.json'), 'utf8'));
    const w = j.wikitext || '';
    intro = w ? stripLinks(w.split(/^==/m)[0]).replace(/\{\{[^}]*\}\}/g, ' ') : null;
  } catch { /* uncached page — fine */ }
  rawCache.set(n.pageid, intro);
  return intro;
}
// Kill-source capture — WHAT do you have to kill. Covers the explicit forms
// ("dropped by cows, deer and wolves", "obtained by killing zogres") AND the
// gather-prose that actually describes kills: the wiki never says "drop" for
// hides — "gathered from animals like cows, deer, and wolves" — so without
// this they would ride a bare "picked / collected" method label.
const KILL_PATTERNS = [
  /\b(?:dropped by|dropped from|obtained by killing|killed from|by killing)\b\s+([^.;]{3,110})/i,
  /\bgathered from ((?:large |small |big )?(?:animals?|creatures?|monsters?|beasts)\b[^.;]{0,90})/i,
  // list-shaped: "gathered from rats, kebbits, and chinchompas" — small-creature
  // prose that never says "animals". Cut early on anything that isn't a name list.
  /\bgathered from ((?:[a-z][a-z'’\- ]{2,28})(?:,\s*| and | or )+[^.;]{0,80})/i,
];
function killSource(id) {
  const n = nodeById.get(id);
  const intro = n && introFor(n);
  if (!intro) return null;
  for (const re of KILL_PATTERNS) {
    const m = intro.match(re);
    if (!m) continue;
    const src = m[1]
      .replace(/\s+/g, ' ')
      // cut purpose clauses: "…, required to create the Abysmal Whip",
      // "…which can be tanned…", "…that can be processed…", "…or from Chest …"
      .split(/\b(?:which|that) can be\b|,\s*(?:required|used|processed|found|tanned)\b|\bor from\b|\bto create\b|\bwhen killed\b|\band used in\b|\band unlocks\b|\bduring the\b/i)[0]
      // "…enemies and Chest within the Scorned Wilderness" → "…enemies"
      .split(/\b(?:and|or)\s+(?:[A-Za-z]+\s+)?(?:[Cc]hests?|[Dd]ungeons?|[Vv]aults?)\b/)[0]
      .replace(/^killing\s+/i, '') // "killed from: killing kebbits" → "killed from: kebbits"
      .replace(/\s+(?:and|or|such as|including|like|with)\s*$/i, '')
      .replace(/[,;\s]+$/, '')
      .trim();
    if (src.length > 2) return src.slice(0, 110);
  }
  return null;
}

// The "How it's obtained" cell: one phrase per known entry, joined by " · ".
// When the wiki prose names the killers, even a "picked"-classified entry is
// reworded to "killed from: …" so the checklist reads like the game plays.
function howCell(id) {
  const fi = FI[id] || [];
  const kill = killSource(id);
  if (!fi.length) return kill ? `killed from: ${kill}` : 'unknown — please say how you got it';
  const parts = [];
  for (const f of fi) {
    let how = HOW_LABEL[f.method] || f.method || 'other (unclear method)';
    if (kill && ['drops', 'picked', 'other'].includes(f.method)) {
      how = `killed from: ${kill}`;
    } else if (f.tool && (f.method === 'mined' || f.method === 'chopped')) {
      how += ` (${f.tool})`;
    }
    if (!parts.includes(how)) parts.push(how);
  }
  return parts.join(' · ');
}

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
// lore / plans / cosmetic artefact patterns → their bucket score. Checked
// BEFORE zone/keyword matches so "Whispering Elbow Pad" (vestige) or
// "PLAN: Barrel Pile" don't ride zone-name or drop-word matches.
const ARTEFACT_PATTERNS = [
  [/\bvestige\b/i, 'lore & relics', 4000],
  [/\b(tome|engram|relic)\b/i, 'lore & relics', 4000],
  [/^PLAN: |^PATTERN: |^Plan Bundle: /i, 'plans & blueprints', 4600],
  [/\b(skillcape|skill cape|cape|cloak|shawl|scarf|wraps?|cowl|banner|mount|wigs?|mask|head[1-3])\b/i, 'cosmetics', 4200],
];
const GROUP_HEADING = {
  'metal tier': 'Metal-tier names', 'zone names': 'Zone-gated names', 'raw gatherables': 'Raw gatherables',
  materials: 'Materials', 'monster drops': 'Monster-drop materials & packs', usables: 'Usables (potions, food, gear…)',
  'lore & relics': 'Lore & relics', cosmetics: 'Cosmetics, capes & mounts', 'plans & blueprints': 'Plans & blueprints',
  'quest & rewards': 'Quest & reward items', unclassified: 'Unclassified',
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
  // lore / plans / cosmetic artefacts — before zone & keyword matches so
  // "Whispering Elbow Pad" (vestige) or "PLAN: Barrel Pile" ("pile") stay here
  for (const [re, group, score] of ARTEFACT_PATTERNS) if (re.test(name) || re.test(type)) return { score, group };
  // 1000-1500: zone-gated flora/fauna/sub-regions (after artefacts, so
  // "PATTERN: Bramblemead Cape" stays a cosmetic rather than zone-gated)
  for (const [frag, t] of ZONE_TIER) if (low.includes(frag)) return { score: 1000 + t, group: 'zone names' };
  // 1600: gatherable raws (the useful stuff to locate early)
  if (HERB_RE.test(name) || /\b(plant|seed|berry|berries|root|herb|leaf|flower|mushroom|egg|feather|antler|steak|meat|wine|vial|cabbage|weed|lily|bark|nest)\b/i.test(name)) return { score: 1600, group: 'raw gatherables' };
  // 1700: general materials/resources + gems
  if (['material', 'resource'].includes(n.kind) || /material|resource|component|ingredient/i.test(type) || /\b(emerald|sapphire|ruby|onyx|opal|topaz|jade)\b/i.test(name)) return { score: 1700, group: 'materials' };
  // 2000: monster-drop materials (hides, bones, scales, salvage piles, fragments…)
  if (/\b(hide|fang|bone|scale|ichor|ashes?|scrap|salvage|pile|essence|shard|crystal|visage|heart|cotton|chitin|carapace|appendage|sphere|fibre|fiber|pack|fragments?)\b/i.test(name)) return { score: 2000, group: 'monster drops' };
  // 2500: potions/food/trinkets/ammo/gear are usable mid-game
  if (['potion', 'food', 'drink', 'trinket', 'ammo', 'weapon', 'armour'].includes(n.kind) || /\b(armour|weapon|shield|ammo|arrow|potion|food|drink|jewellery|ring|emblem)\b/i.test(`${name} ${type}`)) return { score: 2500, group: 'usables' };
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

// ---------------------------------------------------------------------------
// Table emission
// ---------------------------------------------------------------------------
const LOC_COLUMNS = [...ASHENFALL_LOCATIONS]; // table column order == page order

function tableHeader() {
  return '| Item | Wiki | How it\'s obtained | ' + LOC_COLUMNS.join(' | ') + ' | Notes |\n'
    + '|' + Array(3 + LOC_COLUMNS.length + 1).fill(' --- ').join('|') + '|\n';
}

// one row per item; already-annotated regions come pre-ticked with `x`
function tableRow(n, methodCell, knownRegions) {
  const url = wikiURL(n);
  const cells = LOC_COLUMNS.map(loc => (knownRegions && knownRegions.has(loc) ? 'x' : ''));
  return `| **${n.id}** | ${url ? `[wiki](${url})` : '—'} | ${methodCell} | ${cells.join(' | ')} | |`;
}

function table(items) { // items: [{ n, methodCell, knownRegions }]
  return tableHeader() + items.map(it => tableRow(it.n, it.methodCell, it.knownRegions)).join('\n') + '\n';
}

// classify every foundable item
const partial = [];   // annotated but at least one entry lacks a region
const unknown = [];   // no annotation at all
for (const n of foundable) {
  const fi = FI[n.id] || [];
  if (!fi.length) { unknown.push(n); continue; }
  if (fi.some(f => !f.region)) partial.push(n);
}

const OUT_DIR = path.join(ROOT, 'docs/checklists');
fs.mkdirSync(OUT_DIR, { recursive: true });

const locFooter = `**Locations are in [Ashenfall page order](https://dragonwilds.runescape.wiki/w/Ashenfall)** — each major division followed by its territories, south → far north → the dragonkin reaches → the sands. \`Ashenfall (whole world)\` means the item is not tied to a spot (it drops anywhere). Put an \`x\` in every column where you found the item, and use **Notes** for anything richer — which monster, which chest, which tool.\n`;

const files = [];

// needs-locations.md — method known (from the wiki prose), region missing
{
  const items = partial.sort((a, b) => a.id.localeCompare(b.id)).map(n => {
    const known = new Set((FI[n.id] || []).map(f => f.region).filter(Boolean));
    return { n, methodCell: howCell(n.id), knownRegions: known };
  });
  const intro = `Items the wiki prose already ties to a gather method but whose **where** is missing or incomplete. Known regions are pre-ticked; fill the gaps while you play.`;
  const md = `# Needs locations — ${items.length} item${items.length === 1 ? '' : 's'}\n\n${intro}\n\n${locFooter}\n`
    + table(items);
  const file = path.join(OUT_DIR, 'needs-locations.md');
  fs.writeFileSync(file, md);
  files.push([file, items.length]);
}

// unknown-source.md — no annotation at all; grouped by likely in-game
// progression (early-game gatherables first, lore/quest items last), one
// table per tier, groups in first-appearance (progression) order
{
  const scored = progressionSort(unknown);
  const intro = `Items with **no source annotation at all** — the wiki prose never said where they come from (or the parser couldn't tell). Note both the **how** (the third column starts as *unknown*) and the **where**.\n\nGrouped by **likely in-game progression** (a heuristic — name patterns, metal/zone tiers and what recipes consume the item, since the dataset carries no level gates).`;
  let md = `# Unknown source — needs method + location — ${scored.length} items\n\n${intro}\n\n${locFooter}`;
  // stable group buckets in first-appearance order (progressionSort already
  // ordered them; groupby must not re-sort)
  const groups = [];
  const seen = new Set();
  for (const { group } of scored) {
    if (!seen.has(group)) { seen.add(group); groups.push(group); }
  }
  for (const group of groups) {
    const members = scored.filter(x => x.group === group);
    md += `\n## ${GROUP_HEADING[group] || group} — ${members.length}\n\n`
      + table(members.map(({ n }) => ({ n, methodCell: 'unknown — please say how you got it', knownRegions: null })));
  }
  const file = path.join(OUT_DIR, 'unknown-source.md');
  fs.writeFileSync(file, md);
  files.push([file, scored.length]);
}

// summary
let total = 0;
console.log('checklists written to docs/checklists/:');
for (const [file, count] of files) { console.log(`  ${path.basename(file).padEnd(22)} ${String(count).padStart(4)} items`); total += count; }
console.log(`  (${total} checklist rows across ${files.length} files; ${unknown.length} fully unannotated, ${partial.length} partial)`);
console.log(`  locations per row: ${LOC_COLUMNS.length} (Ashenfall page order)`);

// sanity: every foundable accounted for exactly once across unknown + partial + fully-located
const located = foundable.filter(n => (FI[n.id] || []).length && (FI[n.id] || []).every(f => f.region)).length;
if (unknown.length + partial.length + located !== foundable.length) {
  console.error(`ACCOUNTING MISMATCH: unknown ${unknown.length} + partial ${partial.length} + located ${located} != foundable ${foundable.length}`);
  process.exit(1);
}
console.log(`accounting OK: ${unknown.length} unknown + ${partial.length} partial + ${located} fully located = ${foundable.length} foundable`);
