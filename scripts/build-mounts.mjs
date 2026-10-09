// Builds public/mounts.js — the mount layer, mined from the wiki's Mount page
// (cache/raw/8803.json, fetched on demand by fetch-page.mjs).
//
// The `=== Types of Mounts ===` prose names the two base mounts (terrorbird,
// magic carpet) and the `==== Terrorbirds ====` / `==== Magic Carpets ====`
// tables list every cosmetic variant with its requirements (the quests you must
// have progressed) and how to obtain it (bought / dropped / awarded). Together
// that is the "where and how" the atlas was missing: each mount node gets its
// unlocking quest(s) — so the graph grows a quest → mount spoke — plus the
// acquisition line and lore shown in the panel.
//
// Shape:
//   window.DW_MOUNTS = {
//     source, generatedAt,
//     mounts: { [nodeId]: { name, base, quests[], obtain, lore, vestige } },
//   }
//
// Depends on public/quests.js (run scripts/build-quests.mjs first) to know which
// requirement lines name a real quest.
//
// Regenerate with:  node scripts/build-mounts.mjs [--refresh]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fetchPage } from './fetch-page.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'Mount';

/* ── wikitext helpers (same shapes as build-quests.mjs) ─────────── */
const stripMarkup = t => String(t)
  .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
  .replace(/\{\{[^{}]*?\|([^}|]*?)\}\}/g, '$1')
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/<[^>]*>/g, '')
  .replace(/'''?/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const firstLink = t => {
  const m = String(t).match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  return m ? (m[2] || m[1]).trim() : stripMarkup(t);
};
const links = t => [...String(t).matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map(m => (m[2] || m[1]).trim());
const canon = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

function splitCell(raw) {
  const m = String(raw).match(/^([^|]*?)\s*\|([\s\S]*)$/);
  if (m && /\b(rowspan|colspan|style|class|align|valign|width|height|scope)\s*=/.test(m[1])) {
    return { attrs: m[1], text: m[2] };
  }
  return { attrs: '', text: raw };
}
function tables(wikitext) {
  const out = [];
  let i = 0;
  for (;;) {
    const s = wikitext.indexOf('{|', i);
    if (s < 0) break;
    const e = wikitext.indexOf('|}', s);
    if (e < 0) break;
    out.push(wikitext.slice(s, e));
    i = e + 2;
  }
  return out;
}
function parseTable(tbl) {
  const headers = [];
  const rows = [];
  let cur = null;
  for (const raw of tbl.split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('{|') || t.startsWith('|}')) continue;
    if (t.startsWith('!')) { for (const h of t.slice(1).split('!!')) headers.push(stripMarkup(splitCell(h).text)); continue; }
    if (t.startsWith('|-')) { cur = []; rows.push(cur); continue; }
    if (t.startsWith('|')) { if (!cur) { cur = []; rows.push(cur); } cur.push(splitCell(t.slice(1))); continue; }
    if (cur?.length) cur[cur.length - 1].text += `\n${t}`;
  }
  return { headers, rows };
}
function expandRowspans(rows) {
  const carry = new Map();
  const out = [];
  for (const cells of rows) {
    const row = [];
    const src = [...cells];
    let col = 0;
    const fill = () => {
      while (carry.has(col)) {
        const c = carry.get(col);
        row[col] = c.text;
        c.left -= 1;
        if (c.left <= 0) carry.delete(col);
        col += 1;
      }
    };
    while (src.length) {
      fill();
      const cell = src.shift();
      row[col] = cell.text;
      const rs = /\browspan\s*=\s*"?(\d+)/.exec(cell.attrs);
      if (rs && Number(rs[1]) > 1) carry.set(col, { left: Number(rs[1]) - 1, text: cell.text });
      col += 1;
    }
    fill();
    out.push(row);
  }
  return out;
}

/* ── quest matching ────────────────────────────────────────────── */
// Requirement lines are prose ("Partial completion of Withering Hights" — the
// wiki's own typo) so match a quest when every meaningful word of its name
// appears in the line, allowing one-character slips per word.
const STOP = new Set(['of', 'the', 'a', 'an', 'and', 'to', 'in', 'on', 'with', 'is', 'at']);
const words = s => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
const near = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
};
function questsInLine(line, questNames) {
  const lw = words(line);
  const hits = [];
  for (const q of questNames) {
    const qw = words(q);
    if (!qw.length || qw.length > lw.length) continue;
    let used = 0;
    const pool = [...lw];
    let ok = true;
    for (const w of qw) {
      const idx = pool.findIndex(c => near(c, w));
      if (idx < 0) { ok = false; break; }
      pool.splice(idx, 1);
      used++;
    }
    if (ok && used === qw.length) hits.push(q);
  }
  return hits;
}

/* ── obtain / lore split ───────────────────────────────────────── */
// The acquisition is always marked up in italics (usually bold-italic); the
// remaining prose is the variant's lore, which the atlas shows as its blurb.
function splitObtain(misc) {
  const obtain = [];
  let rest = misc;
  rest = rest.replace(/'''''([\s\S]*?)'''''/g, (_, t) => { obtain.push(stripMarkup(t)); return ''; });
  if (!obtain.length) rest = rest.replace(/''([\s\S]*?)''/g, (_, t) => { obtain.push(stripMarkup(t)); return ''; });
  return {
    obtain: obtain.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '),
    // drop the bullet asterisks the cell inherits from its list markup
    lore: stripMarkup(rest.split('\n').filter(Boolean).join(' ')).replace(/^[\s*]+|[\s*]+$/g, ''),
  };
}

/* ── run ───────────────────────────────────────────────────────── */
const refresh = process.argv.includes('--refresh');
const page = await fetchPage(PAGE, { refresh });
const wikitext = page.wikitext;

// quest names (from the quest layer) — the "requirements" column only counts
// when it names one of these
const qctx = { window: {} };
vm.createContext(qctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/quests.js'), 'utf8'), qctx);
const QUEST_NAMES = qctx.window.DW_QUESTS?.order || [];
if (!QUEST_NAMES.length) {
  console.error('public/quests.js has no quests — run scripts/build-quests.mjs first');
  process.exit(1);
}

// dataset nodes — resolve a wiki display name to an atlas id
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data.json'), 'utf8'));
const allIds = D.nodes.map(n => n.id);
function resolveName(name) {
  const c = canon(name);
  if (!c) return null;
  const exact = allIds.find(id => canon(id) === c);
  if (exact) return exact;
  // "Magic Carpet" on the Mount page is the atlas' "MOUNT: Magic Carpet" item:
  // prefer ids that extend the name (the wiki prefixes cosmetic items) over
  // ids the name extends ("Magic" ⊂ "Magic Carpet" is a different thing).
  const extendsName = allIds.filter(id => canon(id).includes(c));
  const pool = extendsName.length ? extendsName : allIds.filter(id => c.includes(canon(id)));
  if (!pool.length) return null;
  const scored = pool.map(id => ({ id, d: canon(id).length - c.length })).sort((a, b) => a.d - b.d);
  // only mount nodes, or a single unambiguous item node — never guess between two
  if (scored.length === 1) return scored[0].id;
  if (scored[0].d === scored[1].d) return null;
  return scored[0].id;
}

// map every row → { name, base, quests[], obtain, lore, vestige }
const mounts = {};
const skipped = [];
const BASE_OF = { Terrorbirds: 'terrorbird', 'Magic Carpets': 'magic carpet' };

for (const tbl of tables(wikitext)) {
  const { headers, rows } = parseTable(tbl);
  if (!headers.some(h => /requirements/i.test(h))) continue;
  // section heading immediately above the table names the base mount
  const at = wikitext.indexOf(tbl);
  const head = [...wikitext.slice(Math.max(0, at - 400), at).matchAll(/={3,4}\s*([^=\n]+?)\s*={3,4}/g)].pop();
  const base = BASE_OF[(head?.[1] || '').trim()] || null;
  for (const row of expandRowspans(rows)) {
    const [, nameCell, reqCell, miscCell] = row;
    if (!nameCell || !/\[\[/.test(nameCell)) continue;
    const name = firstLink(nameCell);
    const id = resolveName(name);
    if (!id) { skipped.push(`${name} (no dataset node)`); continue; }
    const reqLines = String(reqCell || '').split('\n').map(l => stripMarkup(l.replace(/^\s*\*+\s*/, ''))).filter(Boolean);
    const quests = [...new Set(reqLines.flatMap(l => questsInLine(l, QUEST_NAMES)))];
    const { obtain, lore } = splitObtain(String(miscCell || ''));
    mounts[id] = { name: id, base, quests, obtain, lore, vestige: null };
  }
}

// vestige: the {{Infobox Mount}} `vestige =` field names the item that unlocks
// the variant — shown in the panel as a jump, not a graph edge
for (const n of D.nodes) {
  if (n.kind !== 'mount' || !mounts[n.id] || !n.pageid) continue;
  const f = path.join(ROOT, `cache/raw/${n.pageid}.json`);
  if (!fs.existsSync(f)) continue;
  const v = (JSON.parse(fs.readFileSync(f, 'utf8')).wikitext || '').match(/^\s*\|\s*vestige\s*=\s*(.+)$/m);
  if (!v) continue;
  const link = links(v[1])[0];
  const id = link ? allIds.find(x => canon(x) === canon(link)) : null;
  if (id) mounts[n.id].vestige = id;
}

const out = {
  source: `https://dragonwilds.runescape.wiki/w/${PAGE.replace(/ /g, '_')}`,
  generatedAt: new Date().toISOString(),
  mounts,
};

const header = `// Mounts (P7): generated by scripts/build-mounts.mjs from the cached wiki\n` +
  `// wikitext of the Mount page — per mount node its base type, the quest(s) that\n` +
  `// unlock it, how to obtain it and its lore. Shape: { mounts: { [nodeId]: {\n` +
  `// name, base, quests[], obtain, lore, vestige } } }.\n` +
  `window.DW_MOUNTS = ${JSON.stringify(out)};\n`;
fs.writeFileSync(path.join(ROOT, 'public/mounts.js'), header);

const ids = Object.keys(mounts);
const withQuests = ids.filter(id => mounts[id].quests.length).length;
const withObtain = ids.filter(id => mounts[id].obtain).length;
console.log(`wrote public/mounts.js — ${ids.length} mounts (${mounts[ids[0]] ? `base types: ${[...new Set(ids.map(i => mounts[i].base))].join(', ')}` : 'none'})`);
console.log(`  with requirement quests: ${withQuests} · with an acquisition line: ${withObtain}`);
for (const id of ids) console.log(`  ${id} [${mounts[id].base}] ← ${mounts[id].quests.join(', ') || '(none)'} · ${mounts[id].obtain.slice(0, 70)}`);
if (skipped.length) console.log('skipped:', skipped.join('; '));
