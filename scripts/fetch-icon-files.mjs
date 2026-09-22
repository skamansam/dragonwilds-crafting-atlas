// Downloads all referenced icons into site/icons/ and rewrites data.js icon URLs to local paths.
import fs from 'node:fs';
import path from 'node:path';

const ICONS = new URL('../site/icons/', import.meta.url).pathname;
fs.mkdirSync(ICONS, { recursive: true });

const dataPath = new URL('../cache/final-dataset.json', import.meta.url).pathname;
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const urls = new Set();
for (const n of d.nodes) if (n.icon) urls.add(n.icon);
for (const s of d.spells) if (s.icon) urls.add(s.icon);
for (const s of d.skills) if (s.icon) urls.add(s.icon);
console.log('unique icon urls:', urls.size);

const map = new Map(); // url -> local path
let i = 0;
for (const url of urls) {
  const safe = url.split('/').pop().replace(/[^A-Za-z0-9._'()-]/g, '_');
  const local = 'icons/' + safe;
  map.set(url, local);
  const file = path.join(ICONS, safe);
  if (fs.existsSync(file)) { i++; continue; }
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'DragonwildsCraftingExplorer/1.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      break;
    } catch (e) {
      if (a === 3) console.error('FAILED', url, e.message);
      await new Promise(r => setTimeout(r, 1500 * (a + 1)));
    }
  }
  i++;
  if (i % 300 === 0) console.log(`${i}/${urls.size}`);
  await new Promise(r => setTimeout(r, 120));
}

// rewrite dataset icons to local paths and re-emit data.js
for (const n of d.nodes) if (n.icon && map.has(n.icon)) n.icon = map.get(n.icon);
for (const s of d.spells) if (s.icon && map.has(s.icon)) s.icon = map.get(s.icon);
for (const s of d.skills) if (s.icon && map.has(s.icon)) s.icon = map.get(s.icon);

fs.writeFileSync(dataPath, JSON.stringify(d, null, 1));
fs.writeFileSync(new URL('../site/data.js', import.meta.url).pathname,
  'window.DW_DATA = ' + JSON.stringify(d) + ';');
console.log('done. data.js rewritten with local icon paths');
