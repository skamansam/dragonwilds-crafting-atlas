// Builds public/quests.js — the quest layer of the atlas, mined from the wiki's
// Quests page (cache/raw/464.json, fetched on demand by fetch-page.mjs):
//
//   * `==List of quests==` tables give, per quest, its type (primary/secondary),
//     the region(s) it sits in and the wiki's "Where to Start" line — that line
//     becomes the quest node's description in the app.
//   * `==List of unique quest rewards==` tables pair each reward item with the
//     quest that grants it, which becomes the quest → item half of the graph.
//     Sub-headings (Cape, Furniture, Food, …) are display-only grouping.
//
// The result is an overlay, not dataset surgery: data.json keeps every item and
// recipe untouched, and src/app.js synthesizes the quest nodes and their
// `region → quest → item` spokes at boot, exactly like the found-in region hubs.
// Shape:
//   window.DW_QUESTS = {
//     source, generatedAt,
//     order: [questName, …],
//     quests: { [name]: { name, type, tier, regions[], whereToStart, rewards[{item,post,during}] } },
//     regionQuests: { [region]: [questName, …] },
//   }
//
// Regenerate with:  node scripts/build-quests.mjs [--refresh]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage } from './fetch-page.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'Quests';

/* ── wikitext helpers ──────────────────────────────────────────── */

const stripMarkup = t => String(t)
  .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a) // [[Page|Display]] → Display
  .replace(/\{\{[^{}]*?\|([^}|]*?)\}\}/g, '$1')                       // {{Plink|Name|…}} → Name
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/<[^>]*>/g, '')
  .replace(/'''?/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** every [[display]] inside a cell, in order */
const links = t => [...String(t).matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map(m => (m[2] || m[1]).trim());

/** first [[display]] (or the stripped text when there is no link) */
function firstLink(t) {
  const l = links(t);
  return l.length ? l[0] : stripMarkup(t);
}

/** canonical key for cross-table name matching ("Mirror, Mirror" → "mirrormirror") */
const canon = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** split a table cell line into `attrs` + `text` ("rowspan=\"4\" |Primary" → …) */
function splitCell(raw) {
  const m = String(raw).match(/^([^|]*?)\s*\|([\s\S]*)$/);
  if (m && /\b(rowspan|colspan|style|class|align|valign|width|height|scope)\s*=/.test(m[1])) {
    return { attrs: m[1], text: m[2] };
  }
  return { attrs: '', text: raw };
}

/** every `{| … |}` wikitable in the page, as raw text */
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

/** a wikitable → { headers, rows } where a row is a list of { attrs, text } */
function parseTable(tbl) {
  const headers = [];
  const rows = [];
  let cur = null;
  for (const raw of tbl.split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('{|') || t.startsWith('|}')) continue;
    if (t.startsWith('!')) {
      for (const h of t.slice(1).split('!!')) headers.push(stripMarkup(splitCell(h).text));
      continue;
    }
    if (t.startsWith('|-')) { cur = []; rows.push(cur); continue; }
    if (t.startsWith('|')) {
      if (!cur) { cur = []; rows.push(cur); }
      cur.push(splitCell(t.slice(1)));
      continue;
    }
    // continuation line — append to the previous cell (rare in these tables)
    if (cur?.length) cur[cur.length - 1].text += `\n${t}`;
  }
  return { headers, rows };
}

/**
 * Expand `rowspan` cells so every row is a flat array of strings aligned to the
 * headers. Columns still "held" by an earlier rowspan are filled in first, which
 * is what makes the quest table's repeated Type/Region cells come out right.
 */
function expandRowspans(rows) {
  const carry = new Map(); // col → { left, text }
  const out = [];
  for (const cells of rows) {
    const row = [];
    const src = cells.map(c => c);
    let col = 0;
    const fillCarried = () => {
      while (carry.has(col)) {
        const c = carry.get(col);
        row[col] = c.text;
        c.left -= 1;
        if (c.left <= 0) carry.delete(col);
        col += 1;
      }
    };
    while (src.length) {
      fillCarried();
      const cell = src.shift();
      row[col] = cell.text;
      const rs = /\browspan\s*=\s*"?(\d+)/.exec(cell.attrs);
      if (rs && Number(rs[1]) > 1) carry.set(col, { left: Number(rs[1]) - 1, text: cell.text });
      col += 1;
    }
    fillCarried();
    out.push(row);
  }
  return out;
}

/* ── the two parses ────────────────────────────────────────────── */

/** quest name → the wiki's "Where to Start" text, from `==List of quests==` */
function parseQuestTables(wikitext, log) {
  const quests = [];
  for (const tbl of tables(wikitext)) {
    const { headers, rows } = parseTable(tbl);
    if (!headers.some(h => /where to start/i.test(h))) continue; // the reward tables don't have it
    const rowsOut = expandRowspans(rows);
    for (const row of rowsOut) {
      const [typeCell, nameCell, regionCell, startCell] = row;
      if (!nameCell || !/\[\[/.test(nameCell)) continue;
      const name = firstLink(nameCell);
      if (!name) continue;
      const type = /secondary/i.test(stripMarkup(typeCell || '')) ? 'secondary' : 'primary';
      quests.push({
        name,
        type,
        tier: stripMarkup(typeCell || '') || (type === 'primary' ? 'Primary' : 'Secondary'),
        regions: [...new Set(links(regionCell || '').map(stripMarkup).filter(Boolean))],
        whereToStart: stripMarkup(startCell || ''),
      });
    }
  }
  log(`quests parsed: ${quests.length}`);
  return quests;
}

/** quest name → [{ item, post, during }] from `==List of unique quest rewards==` */
function parseRewardTables(wikitext, log) {
  const byQuest = new Map(); // questName → [{item, post, during}]
  let rewards = 0;
  for (const tbl of tables(wikitext)) {
    const { headers, rows } = parseTable(tbl);
    if (!headers.some(h => /reward from/i.test(h))) continue;
    for (const cells of expandRowspans(rows)) {
      const [itemCell, fromCell] = cells;
      if (!itemCell || !fromCell) continue;
      const plink = itemCell.match(/\{\{\s*Plink\s*\|\s*([^|}]+)/i);
      if (!plink) continue; // the "Other" section is a bullet list, not item rows
      const item = plink[1].trim().replace(/_/g, ' ');
      const quest = firstLink(fromCell.replace(/^\s*During\s+/i, ''));
      if (!quest || !/\[\[/.test(fromCell)) continue;
      if (!byQuest.has(quest)) byQuest.set(quest, []);
      byQuest.get(quest).push({
        item,
        post: /post[- ]quest/i.test(fromCell),
        during: /^\s*During/i.test(fromCell),
      });
      rewards += 1;
    }
  }
  log(`reward rows parsed: ${rewards} across ${byQuest.size} quests`);
  return byQuest;
}

/* ── run ───────────────────────────────────────────────────────── */

const refresh = process.argv.includes('--refresh');
const page = await fetchPage(PAGE, { refresh });
const wikitext = page.wikitext;

const quests = parseQuestTables(wikitext, console.log);
const rewardsByQuest = parseRewardTables(wikitext, console.log);

// item reward → atlas node id (data.json ids are display names)
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data.json'), 'utf8'));
const nodeIdByCanon = new Map();
for (const n of D.nodes) if (!nodeIdByCanon.has(canon(n.id))) nodeIdByCanon.set(canon(n.id), n.id);

const questByCanon = new Map(quests.map(q => [canon(q.name), q.name]));
const unresolved = [];
let linkedRewards = 0;

for (const q of quests) {
  q.rewards = [];
}
for (const [questName, list] of rewardsByQuest) {
  const target = questByCanon.get(canon(questName));
  if (!target) { unresolved.push(`quest "${questName}" (from the reward table) has no row in the quest list`); continue; }
  const q = quests.find(x => x.name === target);
  for (const r of list) {
    const id = nodeIdByCanon.get(canon(r.item));
    if (!id) { unresolved.push(`reward item "${r.item}" (${target}) is not in the dataset`); continue; }
    if (q.rewards.some(x => x.item === id)) continue;
    q.rewards.push({ item: id, post: r.post, during: r.during });
    linkedRewards += 1;
  }
}

const regionQuests = {};
for (const q of quests) {
  for (const region of q.regions) {
    if (!regionQuests[region]) regionQuests[region] = [];
    regionQuests[region].push(q.name);
  }
}

const out = {
  source: `https://dragonwilds.runescape.wiki/w/${PAGE.replace(/ /g, '_')}`,
  generatedAt: new Date().toISOString(),
  order: quests.map(q => q.name),
  quests: Object.fromEntries(quests.map(q => [q.name, q])),
  regionQuests,
};

const header = `// Quests (P7): generated by scripts/build-quests.mjs from the cached wiki\n` +
  `// wikitext of the Quests page — type, region and "Where to Start" per quest,\n` +
  `// plus the quest ⇄ unique-reward pairing. Shape: { quests: { name: { name,\n` +
  `// type, tier, regions[], whereToStart, rewards[{item, post, during}] } },\n` +
  `// regionQuests: { region: [quest, …] }, order: [quest, …] }.\n` +
  `window.DW_QUESTS = ${JSON.stringify(out)};\n`;
fs.writeFileSync(path.join(ROOT, 'public/quests.js'), header);

const byType = {};
for (const q of quests) byType[q.type] = (byType[q.type] || 0) + 1;
const regions = Object.keys(regionQuests).sort();
console.log(`wrote public/quests.js — ${quests.length} quests (${JSON.stringify(byType)}), ${linkedRewards} reward links, ${regions.length} regions`);
console.log('regions:', regions.map(r => `${r}(${regionQuests[r].length})`).join(', '));
console.log('mount rewards skipped (handled by build-mounts.mjs): the "Other" bullet list is not item rows');
if (unresolved.length) {
  console.log(`unresolved (${unresolved.length}):`);
  for (const u of [...new Set(unresolved)]) console.log('  ·', u);
}
