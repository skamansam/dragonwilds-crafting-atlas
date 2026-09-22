// Fetches all RuneScape: Dragonwilds wiki main-namespace pages (wikitext) via the MediaWiki API.
// Output: cache/raw/<pageid>.json  (title + wikitext)
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://dragonwilds.runescape.wiki/api.php';
const OUT = new URL('../cache/raw/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DragonwildsCraftingExplorer/1.0 (offline data snapshot)' } });
    if (res.status === 429) {
      const wait = 15000 * attempt;
      console.log(`429 rate limited, waiting ${wait}ms...`);
      await sleep(wait);
      return getJson(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (attempt <= 5) {
      await sleep(3000 * attempt);
      return getJson(url, attempt + 1);
    }
    throw e;
  }
}

// 1. List all pages in namespace 0 (non-redirects), paginated
console.log('Listing all pages...');
const pages = [];
let apfrom = '';
while (true) {
  const url = `${API}?action=query&list=allpages&apnamespace=0&apfilterredir=nonredirects&aplimit=max&format=json${apfrom ? `&apfrom=${encodeURIComponent(apfrom)}` : ''}`;
  const d = await getJson(url);
  for (const p of d.query.allpages) pages.push(p);
  if (d.continue && d.continue.apcontinue) {
    apfrom = d.continue.apcontinue;
    await sleep(300);
  } else break;
}
console.log(`Total pages: ${pages.length}`);

// 2. Fetch wikitext in batches of 50 via action=query&prop=revisions&rvprop=content
let done = 0;
for (let i = 0; i < pages.length; i += 50) {
  const batch = pages.slice(i, i + 50);
  const titles = batch.map(p => p.title).join('|');
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(titles)}&format=json&formatversion=2`;
  const d = await getJson(url);
  for (const p of d.query.pages) {
    const file = path.join(OUT, `${p.pageid}.json`);
    if (fs.existsSync(file)) continue; // resume support
    const wt = p.revisions?.[0]?.slots?.main?.content ?? '';
    fs.writeFileSync(file, JSON.stringify({ pageid: p.pageid, title: p.title, wikitext: wt }));
  }
  done += batch.length;
  if (done % 1000 === 0 || done === pages.length) console.log(`Fetched ${done}/${pages.length}`);
  await sleep(250);
}
console.log('Done fetching all pages.');
