// Resolves direct image URLs for every item/station/spell/skill icon via
// the MediaWiki imageinfo API. Writes cache/icons/manifest.json {file -> url}.
import fs from 'node:fs';
import path from 'node:path';

const ICONS = new URL('../cache/icons/', import.meta.url).pathname;
fs.mkdirSync(ICONS, { recursive: true });
const API = 'https://dragonwilds.runescape.wiki/api.php';

const d = JSON.parse(fs.readFileSync(new URL('../cache/parsed/dataset.json', import.meta.url).pathname, 'utf8'));

const wanted = new Set();
for (const i of d.items) if (i.image) wanted.add(i.image);
for (const s of d.stations) if (s.image) wanted.add(s.image);
for (const s of d.spells) if (s.image) wanted.add(s.image);
for (const s of d.skills) if (s.image) wanted.add(s.image);
// icons for ghost/implicit nodes (File:<name>.png by convention)
for (const r of d.recipes) {
  for (const inp of r.inputs) wanted.add(inp.name + '.png');
  wanted.add(r.output + '.png');
}
// spell rune icons
for (const sp of (d.spells || [])) {
  for (const r of Object.keys(sp.runes || {})) wanted.add((/rune$/i.test(r) ? r : r + ' rune') + '.png');
}
console.log('icon files wanted:', wanted.size);

// query in batches of 50
const files = [...wanted];
const manifest = {};
let done = 0;
for (let i = 0; i < files.length; i += 50) {
  const batch = files.slice(i, i + 50);
  const url = `${API}?action=query&titles=${encodeURIComponent(batch.map(f => 'File:' + f).join('|'))}&prop=imageinfo&iiprop=url&format=json&formatversion=2`;
  for (let a = 0; a < 5; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'DragonwildsCraftingExplorer/1.0' } });
      if (res.status === 429) { await new Promise(r => setTimeout(r, 10000)); continue; }
      const jd = await res.json();
      for (const p of jd.query.pages) {
        if (p.imageinfo && p.imageinfo[0]) manifest[p.title.replace(/^File:/, '')] = p.imageinfo[0].url;
      }
      break;
    } catch (e) {
      if (a === 4) console.error('batch failed', e.message);
      await new Promise(r => setTimeout(r, 3000 * (a + 1)));
    }
  }
  done += batch.length;
  if (done % 500 === 0) console.log(`${done}/${files.length}`);
  await new Promise(r => setTimeout(r, 200));
}
fs.writeFileSync(path.join(ICONS, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('resolved icons:', Object.keys(manifest).length);
