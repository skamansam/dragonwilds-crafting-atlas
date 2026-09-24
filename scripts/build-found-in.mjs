// Builds site/found-in.js — per-item location annotations mined from the cached
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

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data.json'), 'utf8'));

// canonical playable regions (Ashenfall is the whole world — not a region node)
const REGIONS = ['Temple Woods', 'Bramblemead Valley', 'Fractured Plains', 'Bloodblight Swamp', 'Whispering Swamp', 'Ghornfell', 'Bleakfields Valley'];
const REGION_RE = new RegExp('\\b(' + REGIONS.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g');

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
let pages = 0, withRegions = 0, withMethodOnly = 0;
for (const n of D.nodes) {
  if (!n.pageid) continue;
  const f = path.join(ROOT, 'cache/raw', n.pageid + '.json');
  if (!fs.existsSync(f)) continue;
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  const w = j.wikitext || '';
  if (!w) continue;
  pages++;
  const intro = w.split(/^==/m)[0];
  const hits = [];
  const pushHit = (region, method, tool) => {
    if (hits.some(h => h.region === region && h.method === method)) return;
    hits.push({ region, method, tool: tool || null });
  };
  // 1) infobox location (authoritative) + infobox tool (fallback for mined/chopped)
  const loc = w.match(/^\s*\|\s*location\s*=\s*(.+)$/m);
  if (loc) for (const r of [...loc[1].matchAll(REGION_RE)]) pushHit(r[1], 'other', null);
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
      if (hits.length) { withMethodOnly++; break; }
    }
  }
  if (hits.length) {
    for (const h of hits) if ((h.method === 'mined' || h.method === 'chopped') && !h.tool && ibTool) h.tool = ibTool;
    out[n.id] = hits.sort((a, b) => (a.region || '').localeCompare(b.region || ''));
    if (hits.some(h => h.region)) withRegions++;
  }
}

const header = `// Found-in annotations (P4-1): generated by scripts/build-found-in.mjs from the\n// cached wiki wikitext — best-effort parse of location prose. Shape:\n// { itemId: [{ region, method, tool }] }; region null = method known, no region named.\nwindow.DW_FOUND_IN = ${JSON.stringify(out)};\n`;
fs.writeFileSync(path.join(ROOT, 'site/found-in.js'), header);
const regionCounts = {};
for (const v of Object.values(out)) for (const h of v) if (h.region) regionCounts[h.region] = (regionCounts[h.region] || 0) + 1;
const methods = {};
for (const v of Object.values(out)) for (const h of v) methods[h.method] = (methods[h.method] || 0) + 1;
console.log(`pages parsed: ${pages} · items annotated: ${Object.keys(out).length} (with regions: ${withRegions}, method-only: ${withMethodOnly})`);
console.log('per region:', JSON.stringify(regionCounts, null, 1));
console.log('per method:', JSON.stringify(methods, null, 1));
// spot-check the user's examples
for (const id of ['Redberries', 'Tin Ore', 'Ash Tree', 'Ash Logs']) console.log(id + ':', JSON.stringify(out[id] || null));
