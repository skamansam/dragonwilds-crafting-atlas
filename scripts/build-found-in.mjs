// Builds public/found-in.js — per-item location annotations mined from the cached
// wiki wikitext (cache/raw/<pageid>.json): which regions an item is found in,
// how it is gathered (mined / chopped / picked / farmed / chest / drops…), and
// the tool needed. Regenerate with:  node scripts/build-found-in.mjs
//
// The wiki's prose is the source of truth; this parser is best-effort:
//   * infobox `|location = [[Region]]` lines are authoritative when present
//   * prose is split into comma-clauses, then each clause scanned for
//     (region, method, tool) — "collected from bushes in Temple Woods and
//     Bramblemead Valley, Farmed from …, found in chests in Ghornfell"
//     becomes three separate findings
//   * "(except X)" clauses are skipped so exclusions never become locations
//   * a region clause without a method borrows the nearest method sentence
//     ("Forests in Bramblemead Valley…" + "felled with any logging axes")
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANON_REGIONS, regionRe } from '../src/regions.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data.json'), 'utf8'));

// The full canonical region list, shared with the app and the exporter
// (src/regions.js). This used to be a hand-written 7-region list, which meant
// every region added after launch — Stormtouched Highlands, Fellhollow, Umbral
// Sands, Dowdun Reach — was invisible here: prose that named them produced a
// "method known, no region named" hit, and those items ended up with no
// ancestor at all in the graph.
const REGION_RE = regionRe('g');

// Versioned entity infoboxes split the location per version and put it on
// |location1… / |location2… rather than a single |location = — and when those
// lines are blank the region rides on |version1… instead (Deer: "|version1 =
// Brynmoor", "|location1 =", "|location3 = [[Dowdun Reach]]"). Reading only
// the plain |location = line silently lost every one of these pages — deer, cow,
// giant rat, the rats — so the materials dropped by them had no region at all.
function infoboxRegions(w, { versions = false } = {}) {
  const named = [];
  const keys = versions ? /locations?|version/ : /locations?/;
  for (const m of w.matchAll(new RegExp(`^\\s*\\|\\s*(?:${keys.source})\\d*\\s*=\\s*(.+)$`, 'gm')))
    for (const r of m[1].matchAll(REGION_RE)) named.push(r[1]);
  return [...new Set(named)];
}

// The prose that may name a location: the lead section, plus an explicit
// ==Location==/==Locations==/==Item sources== section. Deliberately NOT the
// whole page — Journal and Update history sections name regions in lore and
// patch-note asides ("one of [[Brynmoor]]'s nobility in the [[Third Age]]") that
// are not places the item is found, and treating them as locations invents
// edges. Only the lead and the location-bearing sections are trustworthy.
function scanScope(w) {
  const lead = w.split(/^==/m)[0];
  const extra = [];
  for (const m of w.matchAll(/^==+\s*(Locations?|Item sources)\s*==+$/gim)) {
    extra.push(w.slice(m.index + m[0].length).split(/^==/m)[0]);
  }
  return [lead, ...extra].join('\n');
}

const wikiLinks = text => [...text.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1].trim());

const METHODS = [
  { key: 'mined', re: /\bmin(?:e|ed|ing)\b/i },
  { key: 'chopped', re: /\bfelled\b|\bchop\w*\b|\blogging axe\w*\b|\bcut down\b/i },
  { key: 'caught', re: /\bfish\w*\b|\bcaught\b|\bnet\b/i },
  { key: 'picked', re: /\bpicked\b|\bcollected\b|\bgathered\b|\bforaged?\b/i },
  { key: 'farmed', re: /\bfarmed\b|\bfarming\b/i },
  { key: 'chest', re: /\bchests?\b/i },
  { key: 'dungeon', re: /\bdungeon\b|\bvault\b/i },
  { key: 'drops', re: /\bdropped by\b/i },
];
const TOOL_RE = /(?:with|using)\s+(?:any\s+|an?\s+)?(?:\[\[)?([a-z0-9'’\- ]*?(?:pickaxes?|axes?|fishing rod\w*|nets?))(?:\]\])?/i;

function stripLinks(t) { return t.replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, '$1').replace(/'''?/g, ''); }

function clauseScan(clause) {
  const hasExcept = /\bexcept\b|\bnot found\b|\bexcluding\b/i.test(clause);
  let regions = [...clause.matchAll(REGION_RE)].map(m => ({ name: m[1], at: m.index }));
  // regions named inside/after an "(except X)" marker are exclusions, not locations
  if (hasExcept) {
    const exceptAt = clause.indexOf('EXCEPTKEEP');
    if (exceptAt >= 0) regions = regions.filter(r => r.at < exceptAt);
  }
  const methodHits = [];
  for (const m of METHODS) {
    const mm = clause.match(m.re);
    if (mm) methodHits.push({ key: m.key, at: mm.index });
  }
  const toolHits = [];
  for (const tm of clause.matchAll(new RegExp(TOOL_RE.source, 'gi'))) {
    toolHits.push({ tool: tm[1].trim().replace(/\s+axes$/, ' axe').replace(/\s+pickaxes$/, ' pickaxe').replace(/\s+rods?$/, ' rod'), at: tm.index });
  }
  // each region pairs with the NEAREST method/tool mention before it (falls
  // forward when the clause opens with the region): "found in chests in
  // Ghornfell" → chest, "collected from bushes in Temple Woods" → picked
  const paired = regions.map(r => {
    const before = methodHits.filter(mh => mh.at < r.at);
    const after = methodHits.filter(mh => mh.at > r.at);
    const pick = before.length ? before[before.length - 1] : (after[0] || null);
    const tBefore = toolHits.filter(th => th.at < r.at);
    const tAfter = toolHits.filter(th => th.at > r.at);
    const tool = pick ? (tBefore.length ? tBefore[tBefore.length - 1].tool : (tAfter[0] ? tAfter[0].tool : null)) : null;
    return { name: r.name, method: pick ? pick.key : null, tool };
  });
  return { regions: paired, methodHits, toolHits, hasExcept };
}

const out = {};
let pages = 0, withRegions = 0;
for (const n of D.nodes) {
  if (!n.pageid) continue;
  const f = path.join(ROOT, 'cache/raw', n.pageid + '.json');
  if (!fs.existsSync(f)) continue;
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  const w = j.wikitext || '';
  if (!w) continue;
  pages++;
  const intro = scanScope(w);
  const hits = [];
  const pushHit = (region, method, tool) => {
    if (hits.some(h => h.region === region && h.method === method)) return;
    hits.push({ region, method, tool: tool || null });
  };
  // 1) infobox location (authoritative) + infobox tool (fallback for mined/chopped)
  for (const r of infoboxRegions(w)) pushHit(r, 'other', null);
  const ibTool = (() => {
    const t = w.match(/^\s*\|\s*tool\s*=\s*(.+)$/m);
    return t ? stripLinks(t[1]).replace(/\s*\([^)]*\)\s*/g, '').trim() : null;
  })();
  // 2) clause-level prose scan
  const clauses = stripLinks(intro)
    .replace(/\{\{[^}]*\}\}/g, ' ')          // drop templates
    .replace(/\(([^)]*)\)/g, (m, inner) => /\bexcept\b/i.test(inner) ? ' EXCEPTKEEP ' + inner : ' ') // keep except-parens detectable
    .split(/(?:[.;]\s+|,\s+(?=[A-Z]))/)
    .map(s => s.trim()).filter(Boolean);
  const detections = clauses.map(clauseScan);
  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    if (d.hasExcept && !d.regions.length) continue; // "(except X)" — exclusion, not a location
    for (const r of d.regions) {
      let method = r.method;
      let tool = r.tool;
      if (!method) { // borrow the nearest method within ±1 clause (region clause + "felled with axes" clause)
        for (const j2 of [i + 1, i - 1, i + 2]) {
          const nb = detections[j2];
          if (!nb || nb.hasExcept) continue;
          if (nb.regions[0] && nb.regions[0].method) { method = nb.regions[0].method; tool = tool || nb.regions[0].tool; break; }
          if (nb.methodHits.length) { // method-only neighbour: "…Bramblemead Valley are composed of these trees. They can be felled with any logging axes"
            const mh = nb.methodHits[0];
            method = mh.key;
            const tBefore = nb.toolHits.filter(th => th.at < mh.at);
            const tAfter = nb.toolHits.filter(th => th.at > mh.at);
            tool = tool || (tBefore.length ? tBefore[tBefore.length - 1].tool : (tAfter[0] ? tAfter[0].tool : null));
            break;
          }
        }
      }
      pushHit(r.name, method || 'other', method ? tool : null);
    }
  }
  // 3) method-only knowledge (farming, chests, drops) with no region named
  if (!hits.length) {
    // method-only: gatherable somewhere, but the prose never names a region
    for (const d of detections) {
      if (d.hasExcept) continue;
      for (const mh of d.methodHits) {
        const tBefore = d.toolHits.filter(th => th.at < mh.at);
        const tool = (mh.key === 'mined' || mh.key === 'chopped') && tBefore.length ? tBefore[tBefore.length - 1].tool : null;
        pushHit(null, mh.key, tool);
      }
      if (hits.length) break;
    }
  }
  if (hits.length) {
    for (const h of hits) if ((h.method === 'mined' || h.method === 'chopped') && !h.tool && ibTool) h.tool = ibTool;
    out[n.id] = hits.sort((a, b) => (a.region || '').localeCompare(b.region || ''));
  }
}

/* ---------- pass 2: borrow a region from the entity the item comes from ------

   An item that names no region usually names its *source* instead — "mined from
   [[clay node]]s", "gathered from animals like [[cow]]s, [[deer]] and
   [[Wolf|wolves]]", "found in [[Chest (Stormtouched Highlands)|chests]]". The
   source's own page (or its own found-in hits) normally does name a region, so
   the item's region can be borrowed across that link.

   This only fills in entries the parser already recognised as gatherable or
   looted — it never invents a "found in" for an item that had no method hit at
   all, since a crafted item links to its materials and would otherwise inherit
   the region its ore was mined in. */
const regionForTitle = new Map(); // lowercase page title -> [region]
const allPages = new Map();       // lowercase page title -> wikitext
const titleOf = new Map();        // lowercase page title -> title as written
const placeLoc = new Map();       // lowercase page title -> [region] from |location =
const chestName = new Map();      // lowercase "Chest (X)" page -> X
for (const f of fs.readdirSync(path.join(ROOT, 'cache/raw'))) {
  if (!f.endsWith('.json')) continue;
  let j; try { j = JSON.parse(fs.readFileSync(path.join(ROOT, 'cache/raw', f), 'utf8')); } catch { continue; }
  if (!j.title) continue;
  const lower = j.title.toLowerCase();
  allPages.set(lower, j.wikitext || '');
  titleOf.set(lower, j.title);
  const named = infoboxRegions(j.wikitext || '', { versions: true });
  if (named.length) placeLoc.set(lower, named);
  const chest = j.title.match(/^Chest \(([^)]+)\)$/);
  if (chest) chestName.set(lower, chest[1]);
}
// A chest page names the container it sits in, not always the region: the
// dragonkin-vault chests are "Chest (Skeklac Kara)" / "Chest (Chaktan Kara)".
// The scenery page for the vault carries the region, so resolve through it.
for (const [lower, name] of chestName) {
  if (CANON_REGIONS.includes(name)) regionForTitle.set(lower, [name]);
  else if (placeLoc.has(name.toLowerCase())) regionForTitle.set(lower, placeLoc.get(name.toLowerCase()));
}
// every other page that states its region in its own infobox
for (const [lower, regions] of placeLoc) {
  if (!regionForTitle.has(lower)) regionForTitle.set(lower, regions);
}
// an item's own placed region outranks a region borrowed off its page
for (const [id, hits] of Object.entries(out)) {
  const placed = hits.find(h => h.region);
  if (placed) regionForTitle.set(id.toLowerCase(), [placed.region]);
}

let borrowed = 0;
for (const [id, hits] of Object.entries(out)) {
  if (hits.some(h => h.region)) continue; // already placed by prose
  const w = allPages.get(id.toLowerCase());
  if (!w) continue;
  for (const link of wikiLinks(scanScope(w))) {
    const region = regionForTitle.get(link.toLowerCase())?.[0];
    if (!region) continue;
    const first = hits[0] || { method: 'other', tool: null };
    hits.push({ region, method: first.method || 'other', tool: first.tool || null, via: link });
    borrowed++;
    break;
  }
}

/* ---------- pass 3: expand the shared loot-table templates ------------------

   Article pages delegate their loot lists to templates — a chest page says
   {{AnimalMaterialsDropTable}} instead of listing the animal materials itself.
   Now that fetch-wiki.mjs caches namespace 10 those templates are readable
   wikitext, so a page sitting in a known region hands that region to every
   {{DropsLine|name=…}} in the tables it transcludes.

   {{Drop sources list}} and {{Uses recipe list}} are Lua ({{#invoke:…}}) and
   cannot be resolved from wikitext — left alone rather than guessed at. */
const dropNames = text => [...text.matchAll(/\{\{\s*DropsLine\s*\|([^}]*)\}\}/gi)]
  .map(m => (m[1].match(/(?:^|\|)\s*name\s*=\s*([^|}\n]+)/i) || [])[1])
  .filter(Boolean)
  .map(s => stripLinks(s.trim()).split('|')[0].trim())
  .filter(Boolean);

const templateItems = new Map(); // lowercase template title -> [item name]
for (const [title, w] of allPages) {
  if (!title.startsWith('template:')) continue;
  const names = dropNames(w);
  if (names.length) templateItems.set(title, names);
}
const transcluded = text => [...text.matchAll(/\{\{\s*([A-Za-z0-9 _'-]+?)\s*[|}]/g)]
  .map(m => 'template:' + m[1].trim().toLowerCase().replace(/\s+/g, ' '));

const nodeIds = new Set(D.nodes.map(n => n.id));
let tableResolved = 0;
for (const [pageTitle, regions] of regionForTitle) {
  const w = allPages.get(pageTitle);
  if (!w) continue;
  const isChest = /^chest \(/.test(pageTitle);
  const members = new Set(dropNames(w));
  for (const t of transcluded(w)) {
    const list = templateItems.get(t);
    if (list) for (const nm of list) members.add(nm);
  }
  if (!members.size) continue; // a page with no drop table tells us nothing
  const method = isChest ? 'chest'
    : /\bdrops?\b|dropped by/i.test(w.split(/^==/m)[0]) ? 'drops' : 'other';
  for (const nm of members) {
    if (!nodeIds.has(nm)) continue; // only ids that exist in the graph
    const existing = out[nm];
    if (existing?.some(h => h.region)) continue; // never override a placed item
    const hits = existing || [];
    if (hits.some(h => h.region === regions[0] && h.method === method)) continue;
    hits.push({ region: regions[0], method, tool: null, via: titleOf.get(pageTitle) || pageTitle });
    out[nm] = hits;
    tableResolved++;
  }
}

const header = `// Found-in annotations (P4-1): generated by scripts/build-found-in.mjs from the\n// cached wiki wikitext — best-effort parse of location prose. Shape:\n// { itemId: [{ region, method, tool }] }; region null = method known, no region named.\nwindow.DW_FOUND_IN = ${JSON.stringify(out)};\n`;
fs.writeFileSync(path.join(ROOT, 'public/found-in.js'), header);
const regionCounts = {};
for (const v of Object.values(out)) for (const h of v) if (h.region) regionCounts[h.region] = (regionCounts[h.region] || 0) + 1;
const methods = {};
for (const v of Object.values(out)) for (const h of v) methods[h.method] = (methods[h.method] || 0) + 1;
// counted after pass 2, so the two numbers describe the file we just wrote
withRegions = Object.values(out).filter(hits => hits.some(h => h.region)).length;
console.log(`pages parsed: ${pages} · items annotated: ${Object.keys(out).length} (with regions: ${withRegions}, method-only: ${Object.keys(out).length - withRegions})`);
console.log(`regions borrowed via a source entity (pass 2): ${borrowed}`);
console.log(`regions resolved from loot-table templates (pass 3): ${tableResolved} (${templateItems.size} tables in the cache)`);
console.log('per region:', JSON.stringify(regionCounts, null, 1));
console.log('per method:', JSON.stringify(methods, null, 1));
// spot-check the user's examples
for (const id of ['Redberries', 'Tin Ore', 'Ash Tree', 'Ash Logs']) console.log(id + ':', JSON.stringify(out[id] || null));
