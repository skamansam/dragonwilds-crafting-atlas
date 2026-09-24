// Merges exported 💾 snapshots (site ⤓ button) into site/layouts/curated.js so
// every visitor shares the curated arrangements. Files are validated before
// merging: sane bounding box, finite coords, node ids must exist in the data.
// Shape matches the app's own-snapshot convention: flat key → {id:{x,y}} map
// with a sibling "<key>~meta" object (never metadata inside the position map —
// the page sanity-checker treats every map entry as a position).
//
// Usage:
//   node scripts/merge-snapshots.mjs dw-snapshot-elk-layered-wide-130.json [--label "text"]
//   node scripts/merge-snapshots.mjs --list     (show what's currently curated)
//   node scripts/merge-snapshots.mjs --drop "<preset>@<dens>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURATED = path.join(ROOT, 'site/layouts/curated.js');
const DATA = path.join(ROOT, 'site/data.json');

const args = process.argv.slice(2);
const labelIdx = args.indexOf('--label');
const label = labelIdx >= 0 ? args.splice(labelIdx, 2)[1] : undefined;
const drop = args.includes('--drop') ? args[args.indexOf('--drop') + 1] : null;
const list = args.includes('--list');
const files = args.filter(a => a.endsWith('.json'));

// node-id universe
const D = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const known = new Set(D.nodes.map(n => n.id));

// current curated set (merge, never clobber)
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(CURATED, 'utf8'), ctx);
const curated = ctx.window.DW_CURATED || {};

if (list) {
  const keys = Object.keys(curated).filter(k => !k.endsWith('~meta')).sort();
  for (const k of keys) {
    const meta = curated[k + '~meta'] || {};
    console.log(`${k}  nodes=${Object.keys(curated[k]).length}  label=${meta.label || '—'}  merged=${meta.curatedAt || '—'}`);
  }
  if (!keys.length) console.log('(no curated snapshots yet)');
  process.exit(0);
}

if (drop) {
  if (curated[drop]) { delete curated[drop]; delete curated[drop + '~meta']; write(); console.log(`dropped ${drop}`); }
  else console.error(`no curated snapshot "${drop}"`);
  process.exit(0);
}

function isSane(map) {
  const ids = Object.keys(map).filter(k => k !== '~meta');
  if (ids.length < 2) return { ok: false, why: 'fewer than 2 positions' };
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const id of ids) {
    const p = map[id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { ok: false, why: `non-finite coord on "${id}"` };
    if (!known.has(id)) return { ok: false, why: `unknown node id "${id}"` };
    if (p.x < x1) x1 = p.x; if (p.x > x2) x2 = p.x;
    if (p.y < y1) y1 = p.y; if (p.y > y2) y2 = p.y;
  }
  if (x2 - x1 <= 400 || y2 - y1 <= 400) return { ok: false, why: 'degenerate bounding box' };
  return { ok: true };
}

function write() {
  // sort keys; "~meta" (0x7E) sorts immediately after its own key
  const keys = Object.keys(curated).sort();
  const ordered = {};
  for (const k of keys) ordered[k] = curated[k];
  const body = `// Curated community snapshots (merged by scripts/merge-snapshots.mjs — do not\n// edit by hand). Flat key → {nodeId:{x,y}} with a sibling "<key>~meta" object,\n// matching the app's own-snapshot convention. Applied by runLayout() below the\n// visitor's own 💾 snapshots but above the bundled manifest.\nwindow.DW_CURATED = ${JSON.stringify(ordered)};\n`;
  fs.writeFileSync(CURATED, body);
}

let merged = 0;
for (const f of files) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { console.error(`${f}: not valid JSON — skipped`); continue; }
  if (doc.type !== 'dw-snapshot' || !doc.preset || !doc.positions) {
    console.error(`${f}: not a dw-snapshot export (type/preset/positions missing) — skipped`); continue;
  }
  const key = doc.dens ? `${doc.preset}@${doc.dens}` : doc.preset;
  const check = isSane(doc.positions);
  if (!check.ok) { console.error(`${f}: UNSANE — ${check.why} — skipped`); continue; }
  curated[key] = { ...doc.positions };
  curated[key + '~meta'] = {
    spacing: doc.meta?.spacing ?? null,
    curatedAt: new Date().toISOString().slice(0, 10),
    nodes: Object.keys(doc.positions).length,
    ...(label ? { label } : {}),
  };
  merged++;
  console.log(`${f}: merged as "${key}" (${Object.keys(doc.positions).length} nodes)${label ? ` — label: ${label}` : ''}`);
}
if (merged) {
  write();
  const n = Object.keys(curated).filter(k => !k.endsWith('~meta')).length;
  console.log(`curated.js: ${n} snapshots, ${(fs.statSync(CURATED).size / 1048576).toFixed(2)} MB`);
} else console.log('nothing merged; curated.js untouched');
