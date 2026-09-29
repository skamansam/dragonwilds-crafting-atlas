// Downloads the wiki's Skill experience data pages — Module:Skill experience/data/<Skill>.json,
// the same JSON tables the wiki's {{ConstructionXP|...}} template resolves through — into
// cache/xp/, so parse-wiki.mjs can turn `skillxp = {{ConstructionXP|Build_Wall_Tier1}}`
// recipe args into concrete XP numbers instead of leaking the raw template string.
//
// The pages are MediaWiki JSON data pages: an array whose first element is a DataTable
// object with a `Rows` map — each row optionally carrying `SkillXPList[0].XP`. The
// wiki's own {{Skill experience}} Lua module reads exactly these tables
// (mw.loadJsonData('Module:Skill experience/data/Construction.json'), data[1].Rows in
// 1-based Lua = data[0].Rows here).
//
// Usage:  node scripts/fetch-xp-tables.mjs
// Output: cache/xp/Construction.json (only tables actually referenced by scraped
//         recipes are fetched; add more names to WANTED if new templates appear).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_AGENT, RATE_MS, sleep } from './wiki-config.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'cache', 'xp');
fs.mkdirSync(OUT, { recursive: true });

// skillxp templates seen in the raw pages (grep cache/raw): only ConstructionXP.
// Extend this set if a future scrape finds other {{FooXP|...}} forms.
const WANTED = ['Construction'];

const RAW = path.join(ROOT, 'cache', 'raw');
const used = new Set();
for (const f of fs.readdirSync(RAW).filter(f => f.endsWith('.json'))) {
  const wt = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')).wikitext || '';
  for (const m of wt.matchAll(/\{\{(\w+XP)\|/g)) used.add(m[1]);
}
for (const name of used) {
  // template {{ConstructionXP|...}} loads the "Construction" data table
  if (!WANTED.includes(name.replace(/XP$/, ''))) console.error(`NOTE: raw pages reference {{${name}|...}} but it is not in WANTED — extend fetch-xp-tables.mjs`);
}

for (const name of WANTED) {
  const dest = path.join(OUT, `${name}.json`);
  if (fs.existsSync(dest)) { console.log(`${name}: cached`); continue; }
  const url = `https://dragonwilds.runescape.wiki/w/Module:Skill_experience/data/${name}.json?action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) { console.error(`${name}: HTTP ${res.status}`); process.exitCode = 1; continue; }
  const text = await res.text();
  const rows = JSON.parse(text)?.[0]?.Rows ?? null;
  if (!rows) { console.error(`${name}: unexpected page shape — no [0].Rows`); process.exitCode = 1; continue; }
  fs.writeFileSync(dest, text);
  console.log(`${name}: ${Object.keys(rows).length} XP rows → cache/xp/${name}.json`);
  await sleep(RATE_MS);
}
