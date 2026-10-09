// Fetch a single wiki page's wikitext into cache/raw/<pageid>.json, sharing the
// etiquette config of fetch-wiki.mjs (descriptive User-Agent + ~1 req/s).
//
// The small on-demand generators (build-quests.mjs, build-mounts.mjs) call
// fetchPage() so their source page is always present; the generators themselves
// read the cache and only hit the network when the page is missing or when they
// are run with --refresh. Everything else keeps using the bulk cache that
// scripts/fetch-wiki.mjs produces.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_AGENT, RATE_MS, sleep } from './wiki-config.mjs';

const API = 'https://dragonwilds.runescape.wiki/api.php';
const RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cache', 'raw');

const rawFile = pageid => path.join(RAW, `${pageid}.json`);

// title → pageid, built once by scanning the raw cache (3.6k small JSON files)
let titleIndex = null;
function index() {
  if (titleIndex) return titleIndex;
  titleIndex = new Map();
  if (fs.existsSync(RAW)) {
    for (const f of fs.readdirSync(RAW)) {
      if (!f.endsWith('.json')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
        if (j.title) titleIndex.set(j.title, j.pageid);
      } catch { /* half-written cache entry — ignore */ }
    }
  }
  return titleIndex;
}

/** The cached { pageid, title, wikitext } for a page, or null when not cached. */
export function cachedPage(title) {
  const id = index().get(title);
  if (id == null) return null;
  try {
    const j = JSON.parse(fs.readFileSync(rawFile(id), 'utf8'));
    return j.wikitext ? j : null;
  } catch { return null; }
}

/** Cached page when present, otherwise fetched from the wiki and cached. */
export async function fetchPage(title, { refresh = false } = {}) {
  if (!refresh) {
    const hit = cachedPage(title);
    if (hit) return hit;
  }
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1` +
    `&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`wiki HTTP ${res.status} for ${title}`);
  const d = await res.json();
  const p = d.query?.pages?.[0];
  if (!p || p.missing) throw new Error(`wiki page not found: ${title}`);
  const out = { pageid: p.pageid, title: p.title, wikitext: p.revisions?.[0]?.slots?.main?.content ?? '' };
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(rawFile(p.pageid), JSON.stringify(out));
  index().set(p.title, p.pageid);
  await sleep(RATE_MS);
  return out;
}

// CLI: node scripts/fetch-page.mjs "Mount" ["Quests" ...]  (always refreshes)
if (import.meta.url === `file://${process.argv[1]}`) {
  const titles = process.argv.slice(2);
  if (!titles.length) {
    console.error('usage: node scripts/fetch-page.mjs <title> [title ...]');
    process.exit(1);
  }
  for (const t of titles) {
    const p = await fetchPage(t, { refresh: true });
    console.log(`cache/raw/${p.pageid}.json  ${p.title}  (${p.wikitext.length} chars)`);
  }
}
