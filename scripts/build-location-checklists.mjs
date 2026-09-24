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
// Deterministic output (sorted by item id) so re-runs diff cleanly.
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

// unknown-source catch-all
const unkSorted = unknown.sort((a, b) => a.id.localeCompare(b.id));
{
  const intro = `Items with **no source annotation at all** — the wiki prose never said where they come from (or the parser couldn't tell). Note both the method and the region.`;
  let md = header('Unknown source — needs method + region', intro, unkSorted);
  // group by kind for quicker in-game lookup
  const byKind = new Map();
  for (const n of unkSorted) { if (!byKind.has(n.kind)) byKind.set(n.kind, []); byKind.get(n.kind).push(n); }
  for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    md += `\n## ${kind} (${list.length})\n\n`;
    md += list.map(n => entryLine(n, null)).join('\n') + '\n';
  }
  const file = path.join(OUT_DIR, 'unknown-source.md');
  fs.writeFileSync(file, md);
  files.push([file, unkSorted.length]);
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
