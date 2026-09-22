// Parses cached raw wikitext pages into a structured dataset:
// items, recipes, stations, skills, spells, level-unlocks, image refs.
import fs from 'node:fs';
import path from 'node:path';

const RAW = new URL('../cache/raw/', import.meta.url).pathname;
const OUT = new URL('../cache/parsed/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(RAW).filter(f => f.endsWith('.json')).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
console.log(`Parsing ${files.length} raw pages...`);

const INFOBOX_NAMES = new Set(['Infobox Item', 'Infobox Weapon', 'Infobox Armour', 'Infobox Tool', 'Infobox Build', 'Infobox Spell', 'Infobox Resource Node', 'Infobox Skill']);

// ---------- wikitext helpers ----------
function findTemplates(wt, nameRegex) {
  // find candidate starts, then walk braces to the matching close.
  const results = [];
  const re = new RegExp(nameRegex, 'g');
  let m;
  while ((m = re.exec(wt)) !== null) {
    const start = m.index;
    // walk from start counting brace runs; depth in "template units"
    let depth = 0;
    let i = start;
    let end = -1;
    const n = wt.length;
    while (i < n) {
      const c = wt[i];
      if (c === '{' || c === '}') {
        let j = i;
        while (j < n && wt[j] === c) j++;
        const len = j - i;
        const units = Math.floor(len / 2);
        if (c === '{') {
          depth += units;
        } else {
          depth -= units;
          if (depth <= 0) { end = j; break; }
        }
        i = j;
      } else {
        i++;
      }
    }
    if (end === -1) end = n;
    const full = wt.slice(start, end);
    // name = text between {{ and first | or }}
    const nameM = full.match(/^\{\{\s*(.*?)\s*[|}]/s);
    const name = nameM ? nameM[1] : '';
    results.push({ start, end, name, full });
    re.lastIndex = end - 1;
  }
  return results;
}

function parseTemplateArgs(full) {
  // strip outer {{ }}, split name off
  let inner = full.replace(/^\{\{/, '').replace(/\}\}$/, '');
  let name = inner;
  let rest = '';
  // find first top-level |
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; i++; continue; }
    if (two === ']]' || two === '}}') { depth--; i++; continue; }
    if (inner[i] === '|' && depth === 0) {
      name = inner.slice(0, i);
      rest = inner.slice(i + 1);
      break;
    }
  }
  // split rest on top-level |
  const parts = [];
  depth = 0;
  let cur = '';
  for (let i = 0; i < rest.length; i++) {
    const two = rest.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue; }
    if (two === ']]' || two === '}}') { depth--; cur += two; i++; continue; }
    if (rest[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += rest[i];
  }
  parts.push(cur);

  const args = {};
  let positional = 0;
  for (const part of parts) {
    // first top-level '=' separates key=value
    let eq = -1;
    depth = 0;
    for (let i = 0; i < part.length; i++) {
      const two = part.slice(i, i + 2);
      if (two === '[[' || two === '{{') { depth++; i++; continue; }
      if (two === ']]' || two === '}}') { depth--; i++; continue; }
      if (part[i] === '=' && depth === 0) { eq = i; break; }
    }
    if (eq === -1) {
      positional++;
      args[String(positional)] = part.trim();
    } else {
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      args[k] = v;
    }
  }
  return { name: name.trim(), args };
}

function cleanVal(v) {
  if (v == null) return '';
  return v
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<nowiki>[\s\S]*?<\/nowiki>/g, (mm) => mm.replace(/<\/?nowiki>/g, ''))
    .trim();
}
function splitBr(v) {
  return cleanVal(v).split(/<br\s*\/?\s*>/i).map(s => s.trim()).filter(Boolean);
}
function plainText(v) {
  return cleanVal(v)
    .replace(/\[\[[Ff]ile:[^\]]*\]\]/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?(.*?)'''?/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function wikiLinks(v) {
  const out = [];
  const re = /\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g;
  let m;
  const s = cleanVal(v);
  while ((m = re.exec(s)) !== null) out.push(m[1].trim());
  return out;
}
function parseRuneReq(v) {
  const s = cleanVal(v);
  const m = s.match(/\{\{RuneReq\|([^}]*)\}\}/);
  if (!m) return null;
  const runes = {};
  for (const kv of m[1].split('|')) {
    const [k, val] = kv.split('=');
    if (k && val) runes[k.trim()] = Number(val) || val.trim();
  }
  return runes;
}

// tabber section labels by offset
function tabberRanges(wt) {
  const ranges = [];
  const re = /<tabber>([\s\S]*?)<\/tabber>/g;
  let m;
  while ((m = re.exec(wt)) !== null) {
    const base = m.index + 8; // after <tabber>
    const body = m[1];
    // split on |-| at top level of the body (they only appear as separators here)
    const sepRe = /(?:^|\n)\s*\|-\s*\|/g;
    const cuts = [];
    let sm;
    while ((sm = sepRe.exec(body)) !== null) cuts.push(sm.index + sm[0].length);
    const bounds = [0, ...cuts, body.length];
    for (let b = 0; b < bounds.length - 1; b++) {
      const seg = body.slice(bounds[b], bounds[b + 1]);
      const lab = seg.match(/^\s*([^=\n]+)=\s*\n/);
      if (!lab) continue;
      const start = base + bounds[b] + lab[0].length;
      const end = base + bounds[b + 1];
      ranges.push({ start, end, label: lab[1].trim() });
    }
  }
  return ranges;
}
function labelAt(ranges, pos) {
  for (const r of ranges) if (pos >= r.start && pos < r.end) return r.label;
  return null;
}

// ---------- main scan ----------
const pagesIndex = {};
const items = [];
const stations = [];
const recipes = [];
const spells = [];
const skills = [];
const levelUnlocks = {};
const imageFiles = new Set();
const referenced = new Set(); // all names referenced anywhere

function addImages(v) {
  for (const mm of cleanVal(v || '').matchAll(/\[?[Ff]ile:([^|\]]+\.(?:png|jpg|jpeg|gif|svg))/g)) {
    imageFiles.add(mm[1].trim());
  }
}

function normType(infoboxName, itemType, title) {
  const t = (itemType || '').toLowerCase();
  const ti = (title || '').toLowerCase();
  if (infoboxName === 'Infobox Build') return 'station';
  if (infoboxName === 'Infobox Spell') return 'spell';
  if (infoboxName === 'Infobox Skill') return 'skill';
  if (infoboxName === 'Infobox Resource Node') return 'resource';
  if (t.includes('weapon') || t.includes('bow') || t.includes('staff') || t.includes('sword')) return 'weapon';
  if (t.includes('armour') || t.includes('armor')) return 'armour';
  if (t.includes('ammo') || ti.includes('arrow') || ti.includes('bolt')) return 'ammo';
  if (t.includes('food')) return 'food';
  if (t.includes('drink')) return 'drink';
  if (t.includes('potion')) return 'potion';
  if (t.includes('trinket') || t.includes('ring') || t.includes('amulet') || t.includes('cape')) return 'trinket';
  if (t.includes('tool')) return 'tool';
  if (t.includes('material') || t.includes('resource') || t.includes('component')) return 'material';
  return 'other';
}

const WEAPON_FIELDS = ['power', 'basedmg', 'additionaldmg', 'damagetype', 'attackstyle', 'durability', 'block', 'combo', 'criticalchance', 'reloadspeed', 'specialaction', 'specialeffect', 'runedamage'];
const ARMOUR_FIELDS = ['power', 'meleedefence', 'rangeddefence', 'magicdefence', 'durability', 'block', 'carryweight', 'specialeffect'];
const ITEM_FIELDS = ['image', 'item_type', 'weight', 'stacklimit', 'repaircost', 'health', 'duration', 'hydration', 'sustenance', 'compostvalue'];

for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  const wt = rec.wikitext || '';
  const title = rec.title;
  pagesIndex[title] = { pageid: rec.pageid };

  // level-up table pages: "Skill/Level up table"
  const lut = title.match(/^([A-Za-z ]+)\/Level up table$/);
  if (lut) {
    const skill = lut[1].trim();
    const rows = [];
    for (const line of wt.split('\n')) {
      const rm = line.match(/^\|\s*(\d+)\s*\|\|\s*(.+)$/);
      if (rm) {
        const unlockText = rm[2];
        const unlocks = [...wikiLinks(unlockText)];
        for (const pm of unlockText.matchAll(/\{\{(?:plink|Item)\|([^}|]+)/g)) unlocks.push(pm[1].trim());
        rows.push({ level: Number(rm[1]), raw: plainText(unlockText), unlocks: [...new Set(unlocks)] });
      }
    }
    if (rows.length) levelUnlocks[skill] = rows;
    continue;
  }

  const ranges = tabberRanges(wt);

  // Infoboxes
  for (const tpl of findTemplates(wt, '\\{\\{\\s*Infobox[ _][^|}]*(?:\\||\\}\\})')) {
    const { name, args } = parseTemplateArgs(tpl.full);
    const base = name.replace(/_/g, ' ').trim();
    if (!INFOBOX_NAMES.has(base)) continue;
    const pageName = args.name || title;

    if (base === 'Infobox Skill') {
      skills.push({
        name: pageName,
        image: (args.image || '').trim(),
        description: splitBr(args.description).map(plainText),
      });
      if (args.image) imageFiles.add(args.image.trim());
      continue;
    }

    if (base === 'Infobox Spell') {
      const spell = {
        name: pageName,
        skill: wikiLinks(args.skill || '')[0] || plainText(args.skill || ''),
        level: args.level ? Number(args.level) : null,
        cooldown: plainText(args.cooldown || ''),
        runes: parseRuneReq(args.runes || '') || {},
        description: splitBr(args.description).map(plainText),
        image: (args.image || '').trim(),
        pageid: rec.pageid,
      };
      spells.push(spell);
      if (spell.image) imageFiles.add(spell.image);
      // spell runes are items too
      for (const r of Object.keys(spell.runes)) referenced.add(r);
      continue;
    }

    // item-ish infoboxes
    const stats = {};
    const fieldList = base === 'Infobox Weapon' ? WEAPON_FIELDS : base === 'Infobox Armour' ? ARMOUR_FIELDS : [];
    for (const k of fieldList) {
      if (args[k] != null && args[k] !== '') {
        stats[k] = splitBr(args[k]).map(plainText).join('; ');
      }
    }
    const item = {
      name: pageName,
      pageid: rec.pageid,
      type: normType(base, args.item_type, pageName),
      itemType: plainText(args.item_type || '') || (base === 'Infobox Build' ? 'Station' : base === 'Infobox Resource Node' ? 'Resource Node' : ''),
      image: (args.image || '').trim(),
      description: splitBr(args.description).map(plainText),
      weight: plainText(args.weight || '') || null,
      stacklimit: plainText(args.stacklimit || '') || null,
      repaircost: args.repaircost ? splitBr(args.repaircost).map(plainText) : [],
      stats,
    };
    if (base === 'Infobox Build') {
      item.catalogue = plainText(args.catalogue || '');
      item.collection = plainText(args.collection || '');
    }
    for (const rc of item.repaircost) for (const l of wikiLinks(rc)) referenced.add(l);
    if (item.image) imageFiles.add(item.image);
    if (base === 'Infobox Build') stations.push(item); else items.push(item);
  }

  // Recipes
  for (const tpl of findTemplates(wt, '\\{\\{\\s*Recipe\\s*[|}]')) {
    const { args } = parseTemplateArgs(tpl.full);
    if (args.bucket === 'no') continue;
    const inputs = [];
    for (let i = 1; i <= 30; i++) {
      const mn = args[`mat${i}`];
      if (!mn) break;
      inputs.push({ name: mn.replace(/_/g, ' ').trim(), qty: Number(args[`mat${i}qty`] || 1) || 1 });
    }
    let output = args.output1 ? args.output1.replace(/_/g, ' ').trim() : title.replace(/_/g, ' ').trim();
    const outputQty = Number(args.output1qty || 1) || 1;
    const facility = (args.facility || '').replace(/_/g, ' ').trim() || null;
    const blueprint = (args.recipe || '').replace(/_/g, ' ').trim() || null;
    const variant = labelAt(ranges, tpl.start);
    const deprecated = /deprecated/i.test(title) || /deprecated/i.test(facility || '') || /deprecated/i.test(variant || '');
    for (const inp of inputs) referenced.add(inp.name);
    referenced.add(output);
    if (facility && facility !== 'Build Menu') referenced.add(facility);
    if (blueprint) referenced.add(blueprint);
    recipes.push({
      output,
      outputQty,
      inputs,
      facility,
      blueprint,
      skill: wikiLinks(args.skill || '')[0] || plainText(args.skill || '') || null,
      xp: args.skillxp ? Number(args.skillxp) || args.skillxp : null,
      notes: args.notes ? splitBr(args.notes).map(plainText) : [],
      variant,
      source: title,
      deprecated,
    });
  }

  // collect File: usages for icon resolution (item images handled above)
  addImages(wt.slice(0, 2000));
}

// ---------- write ----------
const dataset = {
  generatedAt: new Date().toISOString(),
  pageCount: files.length,
  items,
  stations,
  recipes,
  spells,
  skills,
  levelUnlocks,
  pages: pagesIndex,
  referencedNames: [...referenced].sort(),
  imageFiles: [...imageFiles].sort(),
};
fs.writeFileSync(path.join(OUT, 'dataset.json'), JSON.stringify(dataset, null, 1));
console.log(`items: ${items.length}`);
console.log(`stations: ${stations.length}`);
console.log(`recipes: ${recipes.length}`);
console.log(`spells: ${spells.length}`);
console.log(`skills: ${skills.length}`);
console.log(`levelUnlocks skills: ${Object.keys(levelUnlocks).join(', ')}`);
console.log(`referenced names: ${referenced.size}`);
console.log(`image files: ${imageFiles.size}`);
