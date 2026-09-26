#!/usr/bin/env node
/* checklist-csv.mjs — turn the wide hand-annotation checklist tables into CSV
 * (and merge edited CSVs back into the markdown).
 *
 * Markdown editors choke on 38-column prettier-aligned tables; a spreadsheet
 * does not. Usage:
 *
 *   node scripts/checklist-csv.mjs unknown-source            # md -> csv (creates docs/checklists/unknown-source.csv)
 *   node scripts/checklist-csv.mjs unknown-source --merge    # csv -> md (rewrites the tables from the csv)
 *
 * The CSV has one row per item: Section, Item, Wiki, How, <34 location columns>,
 * Notes. Locations take x / blank; "How" falls back to the generator's original
 * text on merge when left blank, so clearing a cell means "keep what it said".
 */
import fs from 'node:fs';
import path from 'node:path';

const NAME = process.argv[2];
if (!NAME || !/^[\w-]+$/.test(NAME)) {
  console.error('usage: node scripts/checklist-csv.mjs <name> [--merge]');
  console.error('  e.g. node scripts/checklist-csv.mjs unknown-source');
  process.exit(1);
}
const MERGE = process.argv.includes('--merge');
const MD = path.resolve('docs/checklists', `${NAME}.md`);
const CSV = path.resolve('docs/checklists', `${NAME}.csv`);
if (!fs.existsSync(MD)) { console.error(`no such file: ${MD}`); process.exit(1); }

const md = fs.readFileSync(MD, 'utf8');
const lines = md.split('\n');

/* ── parse the markdown: sections → {title, header cells, rows, headerLine} ── */
const sections = [];
let cur = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const h2 = line.match(/^## (.+)$/);
  if (h2) { cur = { title: h2[1], header: null, headerLine: -1, rows: [] }; sections.push(cur); continue; }
  if (!cur || !line.startsWith('|')) continue;
  const cells = line.split('|').slice(1, -1).map(c => c.trim());
  if (cells.length < 4) continue;
  if (cells[0] === 'Item') { cur.header = cells; cur.headerLine = i; continue; }
  if (/^[-: ]*$/.test(cells[0])) continue; // alignment rule row
  if (!cur.header) continue;
  cur.rows.push(cells);
}

if (!sections.length || sections.some(s => !s.header)) {
  console.error('could not find section tables (expected "## …" then a "| Item | …" header)');
  process.exit(1);
}
const widths = new Set(sections.map(s => s.header.length));
if (widths.size > 1) {
  console.error(`tables disagree on column count: ${[...widths].join(', ')} — refusing to guess`);
  process.exit(1);
}
const N = sections[0].header.length;
const HOW = 2, FIRST_LOC = 3, NOTES = N - 1;

/* ── CSV helpers (RFC 4180; CRLF so Excel opens it without import drama) ── */
const esc = v => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const unesc = row => {
  const out = []; let cell = '', q = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (q) {
      if (ch === '"') { if (row[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
};

/* ── markdown cell → plain csv cell ── */
const mdToPlain = s => s.replace(/\*\*(.+?)\*\*/g, '$1').trim();
// greedy: wiki URLs may themselves contain parens (…/Desert_Weed_(plant))
const wikiHref = s => { const m = s.match(/^\[wiki\]\((https?:\/\/.+)\)$/); return m ? m[1] : ''; };

if (!MERGE) {
  const out = [['Section', ...sections[0].header].map(esc).join(',')];
  for (const sec of sections) {
    for (const row of sec.rows) {
      if (row.length !== N) {
        console.error(`row with ${row.length} cells (expected ${N}) in "${sec.title}": ${row[0]}`);
        process.exit(1);
      }
      const cells = row.map(mdToPlain);
      cells[1] = wikiHref(cells[1]) || '—'; // "[wiki](url)" → bare url
      out.push([sec.title, ...cells].map(esc).join(','));
    }
  }
  fs.writeFileSync(CSV, out.join('\r\n') + '\r\n');
  console.log(`wrote ${CSV} — ${out.length - 1} item rows across ${sections.length} sections`);
  console.log('edit it in any spreadsheet, then run with --merge to fold it back into the markdown');
  process.exit(0);
}

/* ── merge: read the csv, rewrite each section's table ── */
if (!fs.existsSync(CSV)) { console.error(`no such file: ${CSV} — run without --merge first`); process.exit(1); }
const csvLines = fs.readFileSync(CSV, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
const csvHeader = unesc(csvLines[0]);
const cSec = csvHeader.indexOf('Section');
const cItem = csvHeader.indexOf('Item');
const cHow = csvHeader.indexOf("How it's obtained");
const cNotes = csvHeader.indexOf('Notes');
if (cSec < 0 || cItem < 0 || cHow < 0 || cNotes < 0) {
  console.error('csv is missing one of the Section / Item / "How it\'s obtained" / Notes columns');
  process.exit(1);
}

const byKey = new Map(); // `${section}\u0000${item}` → csv row cells
for (let i = 1; i < csvLines.length; i++) {
  if (!csvLines[i].trim()) continue;
  const cells = unesc(csvLines[i]);
  if (cells.length < Math.max(cSec, cItem, cHow, cNotes) + 1) {
    console.error(`csv line ${i + 1} has ${cells.length} cells — skipping`);
    continue;
  }
  byKey.set(`${cells[cSec]}\u0000${cells[cItem].trim()}`, cells);
}

/* soft validation: warn about items that are not nodes in site/data.json,
 * and remember each node's canonical wiki url so merge can repair broken ones */
let known = null, knownWiki = new Map();
try {
  const data = JSON.parse(fs.readFileSync('site/data.json', 'utf8'));
  known = new Set(data.nodes.flatMap(n => [n.id, n.name].filter(Boolean)));
  for (const n of data.nodes) {
    if (n.wiki) { knownWiki.set(n.name, n.wiki); knownWiki.set(n.id, n.wiki); }
  }
} catch { /* data.json missing/unreadable — skip validation */ }

const isX = v => /^(x|✓|true|1)$/i.test(v.trim());
const urlCell = s => (/^https?:\/\//.test(s.trim()) ? `[wiki](${s.trim()})` : '—');
const cWiki = csvHeader.indexOf('Wiki');
let wikiRepaired = 0;

let changed = 0;
const missing = [], unknownItems = [], orphanSections = new Set();
const matched = new Set();
const newLines = [...lines];

for (const sec of sections) {
  const next = []; // rewritten rows, aligned with sec.rows
  let ok = true;
  sec.rows.forEach((mdRow, ri) => {
    const item = mdToPlain(mdRow[0]);
    const csvRow = byKey.get(`${sec.title}\u0000${item}`);
    if (!csvRow) { missing.push(`${sec.title} / ${item}`); ok = false; return; }
    matched.add(`${sec.title}\u0000${item}`);
    if (known && !known.has(item)) unknownItems.push(item);
    const row = [...mdRow];
    row[0] = `**${item}**`;
    row[1] = urlCell(csvRow[cWiki] ?? '');
    const canonWiki = knownWiki.get(item);
    if (canonWiki && row[1] !== `[wiki](${canonWiki})`) {
      row[1] = `[wiki](${canonWiki})`; // data.json is authoritative (repairs truncated/mangled urls)
      wikiRepaired++;
    }
    const how = (csvRow[cHow] ?? '').trim();
    if (how) row[HOW] = how; // blank in csv → keep the generator's text
    for (let c = FIRST_LOC; c < NOTES; c++) {
      const name = sec.header[c];
      const cc = csvHeader.indexOf(name);
      if (cc < 0) { missing.push(`csv has no column "${name}"`); ok = false; return; }
      row[c] = isX(csvRow[cc] ?? '') ? 'x' : '';
    }
    row[NOTES] = (csvRow[cNotes] ?? '').trim();
    if (JSON.stringify(row) !== JSON.stringify(mdRow)) changed++;
    next[ri] = row;
  });
  if (!ok) { orphanSections.add(sec.title); continue; } // leave this table untouched

  /* re-render the table prettier-aligned */
  const w = sec.header.map((h, ci) => Math.max(h.length, ...next.map(r => r[ci].length)));
  const line = cells => `| ${cells.map((c, i) => c.padEnd(w[i])).join(' | ')} |`;
  const sep = `| ${w.map(x => '-'.repeat(x + 2)).join(' | ')} |`;
  newLines[sec.headerLine] = line(sec.header);
  newLines[sec.headerLine + 1] = sep;
  next.forEach((r, ri) => { newLines[sec.headerLine + 2 + ri] = line(r); });
}

for (const key of byKey.keys()) if (!matched.has(key)) orphanSections.add(key.split('\u0000')[0]);
if (wikiRepaired) console.error(`\nrepaired ${wikiRepaired} wiki link(s) from site/data.json`);
if (missing.length) {
  console.error(`\n${missing.length} csv/markdown rows did not line up (those tables left untouched):`);
  for (const m of missing.slice(0, 10)) console.error('  ' + m);
  if (missing.length > 10) console.error(`  … and ${missing.length - 10} more`);
}
if (unknownItems.length) {
  const uniq = [...new Set(unknownItems)];
  console.error(`\n${uniq.length} items not found in site/data.json (kept anyway):`);
  for (const m of uniq.slice(0, 10)) console.error('  ' + m);
  if (uniq.length > 10) console.error(`  … and ${uniq.length - 10} more`);
}
if (orphanSections.size) console.error(`\nunmatched sections/rows ignored: ${[...orphanSections].join(', ')}`);

fs.writeFileSync(MD, newLines.join('\n'));
console.log(`\nmerged ${CSV} into ${MD} — ${changed} rows changed`);
console.log('then re-render the site checklists: node scripts/build-location-checklists.mjs');
