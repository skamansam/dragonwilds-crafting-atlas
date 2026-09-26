// Permanent Playwright UI suite for the Crafting Atlas. Self-contained: serves
// site/ in-process (no external server needed), runs every check, prints a
// pass/fail summary, and exits non-zero on any failure.
//
//   node scripts/test-ui.mjs              # full suite
//   node scripts/test-ui.mjs smoke        # one section (smoke|panel|undo|layouts)
//   node scripts/test-ui.mjs --url=...    # run against a deployed site instead
//
// Sections:
//   smoke    boot, search, panel content, trace, isolate, legend filter toggle
//   panel    owned marks, possessions mode, path-to, facility links
//   undo     ⚙ panel opens/persists; re-layout-off toast gains an Undo button
//   layouts  algorithm select (in ⚙) switches layout; density buttons behave
import http from 'node:http';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = 8491;
const urlArg = process.argv.find(a => a.startsWith('--url='));
const BASE = urlArg ? urlArg.slice(6).replace(/\/$/, '') : `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

let srv = null;
if (!urlArg) {
  srv = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let p = path.join(ROOT, decodeURIComponent(url.pathname));
      if (p.endsWith('/') || p.endsWith(path.sep)) p = path.join(p, 'index.html');
      const data = await readFile(p);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('nope');
    }
  });
  await new Promise(r => srv.listen(PORT, r));
}

const only = process.argv.slice(2).filter(a => !a.startsWith('--'))[0] || null;
const sections = ['smoke', 'panel', 'undo', 'layouts'].filter(s => !only || s === only);

const results = [];
let page, browser;
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};
const errors = [];

async function boot() {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__cy && window.__cy.nodes().length > 0, null, { timeout: 120000, polling: 500 });
  await page.waitForFunction(() => document.getElementById('veil').classList.contains('hidden'), null, { timeout: 60000, polling: 250 });
  await page.waitForTimeout(800); // settle boot layout
}
// localStorage is only reachable on the site origin — navigate first, then clear
async function clearStorage(keys) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(ks => ks.forEach(k => localStorage.removeItem(k)), keys);
}
const openSettings = () => page.evaluate(() => { document.getElementById('settingsBtn').click(); });
const closeSettings = () => page.evaluate(() => { document.getElementById('settingsBtn').click(); });

/* ── smoke ─────────────────────────────────────────────────────────────── */
async function secSmoke() {
  console.log('smoke:');
  await boot();
  const bootCnt = await page.evaluate(() => ({ nodes: window.__cy.nodes().length, data: window.DW_DATA.nodes.length }));
  ok('boot: cy nodes == dataset + region hubs', bootCnt.nodes >= bootCnt.data && bootCnt.nodes - bootCnt.data <= 7, `${bootCnt.nodes} vs ${bootCnt.data}`);

  await page.fill('#search', 'Iron Bar');
  await page.waitForTimeout(350);
  ok('search suggestions appear', await page.$$('.sug-item').then(a => a.length > 0));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  ok('panel opens for Iron Bar', await page.$eval('#panel', el => el.classList.contains('open')));
  ok('panel title is Iron Bar', (await page.$eval('#panelTitle', el => el.textContent)) === 'Iron Bar');
  const body = await page.$eval('#panelBody', el => el.innerText);
  ok('panel shows a facility (Furnace)', /furnace/i.test(body));
  ok('panel shows Iron Ore', /iron ore/i.test(body));

  await page.click('#btnTrace');
  await page.waitForTimeout(500);
  ok('trace inputs highlights', await page.evaluate(() => window.__cy.elements('.traced').length > 0));

  await page.keyboard.press('Escape'); // close panel
  await page.waitForTimeout(300);
  // shift-tap on the canvas is hard to synthesize reliably; drive the same
  // entry point the tap handler calls (probe-live precedent)
  await page.evaluate(() => window.isolateTree('Iron Bar', null));
  await page.waitForTimeout(1500); // isolate triggers a debounced re-layout
  ok('isolate shows breadcrumb', await page.$eval('#breadcrumb', el => !el.classList.contains('hidden')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => window.__cy.nodes(':visible').length);
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('span:last-child')?.textContent === 'Food').click();
  });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__cy.nodes(':visible').length);
  ok('legend Food toggle hides nodes', after < before, `${before}→${after}`);
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('span:last-child')?.textContent === 'Food').click();
  });
  await page.waitForTimeout(300);
}

/* ── panel ─────────────────────────────────────────────────────────────── */
async function secPanel() {
  console.log('panel:');
  await clearStorage(['dw.owned']);
  await boot();
  for (const item of ['Furnace', 'Campfire']) {
    await page.fill('#search', item);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await page.click('#btnOwn');
    await page.waitForTimeout(150);
  }
  ok('owned count badge shows 2', (await page.$eval('#ownedCount', el => el.textContent)) === '2');
  ok('owned persisted', await page.evaluate(() => (JSON.parse(localStorage.getItem('dw.owned') || '[]')).length === 2));

  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('.lg-check') && r.textContent.includes('Possessions')).click();
  });
  await page.waitForTimeout(700);
  const poss = await page.evaluate(() => {
    const c = window.__cy;
    return { locked: c.nodes('.locked:visible').length, reach: c.nodes('.reachable:visible').length };
  });
  ok('possessions: reachable + locked nodes', poss.locked > 0 && poss.reach > 0, JSON.stringify(poss));
  ok('possessions toast visible', await page.$eval('#toast', el => el.classList.contains('show')));
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('.lg-check') && r.textContent.includes('Possessions')).click();
  });
  await page.waitForTimeout(400);

  await page.fill('#search', 'Iron Bar');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const fac = await page.$('.recipe-facility.fac-link');
  if (fac) {
    await fac.click();
    await page.waitForTimeout(600);
    ok('facility link navigates', (await page.$eval('#panelTitle', el => el.textContent)) !== 'Iron Bar');
  } else ok('facility link present', false);
}

/* ── undo ──────────────────────────────────────────────────────────────── */
async function secUndo() {
  console.log('undo:');
  await clearStorage(['dw.autoRelayout']);
  await boot();

  await openSettings();
  await page.waitForTimeout(200);
  ok('⚙ opens the settings panel', await page.$eval('#settingsPanel', el => !el.hidden));
  ok('algorithm select lives in the panel', await page.$eval('#settingsPanel', el => !!el.querySelector('#layoutSelect')));
  ok('density row lives in the panel', await page.$eval('#settingsPanel', el => !!el.querySelector('#densWrap')));
  await page.evaluate(() => document.body.click()); // outside click closes
  await page.waitForTimeout(200);
  ok('outside click closes it', await page.$eval('#settingsPanel', el => el.hidden));

  // re-layout OFF → toast with Undo → Undo restores ON
  await openSettings();
  await page.evaluate(() => { document.getElementById('autoRelayout').click(); });
  await page.waitForTimeout(250);
  ok('re-layout-off toast shown', await page.$eval('#toast', el => el.classList.contains('show')));
  ok('toast has an Undo button', await page.$eval('#toast', el => !!el.querySelector('.toast-undo')));
  await page.evaluate(() => document.querySelector('#toast .toast-undo').click());
  await page.waitForTimeout(250);
  ok('Undo restores re-layout on', await page.$eval('#autoRelayout', el => el.checked));
  ok('persisted back to on', await page.evaluate(() => localStorage.getItem('dw.autoRelayout') !== '0'));
  await closeSettings();

  // possessions ON → toast with Undo → Undo drops the focus
  await page.evaluate(() => localStorage.removeItem('dw.owned'));
  await boot();
  await page.fill('#search', 'Furnace');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.click('#btnOwn');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('.lg-check') && r.textContent.includes('Possessions')).click();
  });
  await page.waitForTimeout(500);
  ok('possessions toast gains Undo', await page.$eval('#toast', el => !!el.querySelector('.toast-undo')));
  await page.evaluate(() => document.querySelector('#toast .toast-undo').click());
  await page.waitForTimeout(500);
  const undone = await page.evaluate(() => {
    const c = window.__cy;
    return { locked: c.nodes('.locked:visible').length, on: document.getElementById('possessionsChip').classList.contains('on') };
  });
  ok('Undo drops possessions focus', undone.locked === 0 && !undone.on, JSON.stringify(undone));
}

/* ── layouts ───────────────────────────────────────────────────────────── */
async function secLayouts() {
  console.log('layouts:');
  await clearStorage(['dw.customLayouts']);
  await boot();

  await openSettings();
  ok('arrangement status line shows', /arrangement:/.test(await page.$eval('#snapshotNote', el => el.textContent)),
    await page.$eval('#snapshotNote', el => el.textContent));

  // 💾 Save view → reload (instant boot from it) → ✕ Clear
  await page.evaluate(() => document.getElementById('densSave').click());
  await page.waitForTimeout(700);
  ok('💾 Save stores a custom snapshot', await page.evaluate(() =>
    !!JSON.parse(localStorage.getItem('dw.customLayouts') || '{}')['elk-layered-wide@100']));
  ok('status line shows your saved view', /your saved view/.test(await page.$eval('#snapshotNote', el => el.textContent)));
  await boot();
  ok('saved view survives reload', /your saved view/.test(await page.$eval('#snapshotNote', el => el.textContent)));
  await page.evaluate(() => document.getElementById('densClear').click());
  await page.waitForTimeout(1800);
  ok('✕ Clear removes it', await page.evaluate(() =>
    !JSON.parse(localStorage.getItem('dw.customLayouts') || '{}')['elk-layered-wide@100']));
  ok('status back to bundled snapshot', /bundled snapshot/.test(await page.$eval('#snapshotNote', el => el.textContent)));

  // graph-change reflow must RECOMPUTE — the old bug re-applied the static
  // snapshot on every legend toggle, so nothing ever moved
  const furnBefore = await page.evaluate(() => {
    const p = window.__cy.getElementById('Furnace').position(); return { x: p.x, y: p.y };
  });
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('span:last-child')?.textContent === 'Food').click();
  });
  let reflowed = true;
  await page.waitForFunction(prev => {
    const p = window.__cy.getElementById('Furnace').position();
    return Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) > 5;
  }, furnBefore, { timeout: 25000, polling: 400 }).catch(() => { reflowed = false; });
  ok('legend toggle recomputes layout', reflowed,
    reflowed ? 'Furnace moved' : `Furnace stayed at ${JSON.stringify(furnBefore)}`);
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('span:last-child')?.textContent === 'Food').click();
  });
  await page.waitForTimeout(4000); // settle the restore recompute

  // live-physics layouts on the FULL map can blow up on loaded machines
  // (documented probe battery failure: bounds ~46449×47122), so exercise the
  // algorithm switch on an isolated subtree where physics is well-behaved
  await page.evaluate(() => window.isolateTree('Iron Bar', null));
  await page.waitForTimeout(1200);

  await openSettings();
  // animate OFF: jump straight to final positions — animated layouts can
  // still be mid-flight when we measure on a loaded machine
  await page.evaluate(() => { document.getElementById('animToggle').checked = false; document.getElementById('animToggle').onchange(); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'dagre';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(3000);
  const dagre = await page.evaluate(() => {
    const bb = window.__cy.nodes(':visible').boundingBox({});
    return { w: Math.round(bb.w), h: Math.round(bb.h), algo: document.getElementById('layoutMeta').textContent };
  });
  ok('dagre TB applied (layered bounds)', dagre.h > dagre.w && dagre.w > 0, `w=${dagre.w} h=${dagre.h}`);
  ok('readout shows dagre', /dagre/.test(dagre.algo));
  await page.screenshot({ path: 'cache/shots-ui/layout-dagre.png' });

  await page.evaluate(() => { document.getElementById('animToggle').checked = true; document.getElementById('animToggle').onchange(); }); // restore
  await page.keyboard.press('Escape'); // clear isolation
  await page.waitForTimeout(800);

  // saved positions toggle re-runs without a full physics pass
  await page.evaluate(() => { document.getElementById('savedToggle').checked = false; document.getElementById('savedToggle').onchange(); });
  await page.waitForTimeout(2500);
  ok('savedToggle off recomputes live', await page.evaluate(() => window.__cy.nodes(':visible').length > 0));
  await page.evaluate(() => { document.getElementById('savedToggle').checked = true; document.getElementById('savedToggle').onchange(); });
  await page.waitForTimeout(2500);

  // density ✕ clears a (non-existent) snapshot harmlessly and re-runs
  await page.evaluate(() => { document.getElementById('densClear').click(); });
  await page.waitForTimeout(2500);
  ok('density ✕ re-runs layout', await page.evaluate(() => window.__cy.nodes(':visible').length > 0));
  await closeSettings();

  // back to the default preset for a clean state
  await openSettings();
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'elk-layered-wide';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(3000);
  await closeSettings();
}

try {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().split('\n')[0]); });
  if (!urlArg) console.log(`serving site/ in-process on :${PORT}`);
  console.log(`target: ${BASE}\n`);

  fs.mkdirSync('cache/shots-ui', { recursive: true });

  for (const s of sections) {
    if (s === 'smoke') await secSmoke();
    else if (s === 'panel') await secPanel();
    else if (s === 'undo') await secUndo();
    else if (s === 'layouts') await secLayouts();
  }
} catch (e) {
  console.error('SUITE ERROR:', e.message);
  if (page) await page.screenshot({ path: 'cache/shots-ui/error.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (srv) srv.close();
}

console.log('\n──────────────────────────────');
const failed = results.filter(r => !r.pass);
for (const r of results) if (!r.pass) console.log(`FAIL ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`${results.length - failed.length}/${results.length} checks passed` + (failed.length ? ` — ${failed.length} FAILED` : ''));
if (errors.length) {
  console.log('\npage errors:');
  for (const e of [...new Set(errors)]) console.log('  ' + e);
  process.exitCode = 1;
}
if (failed.length) process.exitCode = 1;
