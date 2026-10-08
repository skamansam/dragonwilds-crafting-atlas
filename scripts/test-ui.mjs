// Permanent Playwright UI suite for the Crafting Atlas. Self-contained: serves
// site/ in-process (no external server needed), runs every check, prints a
// pass/fail summary, and exits non-zero on any failure.
//
//   node scripts/test-ui.mjs              # full suite
//   node scripts/test-ui.mjs smoke        # one section (smoke|panel|undo|layouts|tours|route|options)
//   node scripts/test-ui.mjs --url=...    # run against a deployed site instead
//   node scripts/test-ui.mjs --serve-only # just serve site/ on :8491 and stay up
//                                         # (playwright.config.ts uses this as its webServer)
//
// Sections:
//   smoke    boot, search, panel content, highlight, isolate, legend filter toggle
//   panel    owned marks, possessions mode, path-to, facility links
//   edits    in-app node data editing + the browser↔dataset diff window
//   undo     ⚙ panel opens/persists; re-layout-off toast gains an Undo button
//   layouts  algorithm select (in ⚙) switches layout; density buttons behave
//   route    #/<item> selects an item; #/<item>/<item> draws the path between them
//   options  ?layout=/?cats=/?iso=… set the graph view from the URL without
//            persisting anything, and the URL tracks every change made by hand
//   characters  per-character graph state: the first-run prompt (incl. the
//            attach-existing-data path), skill levels + total, switching, delete
import http from 'node:http';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = 8491;
const urlArg = process.argv.find(a => a.startsWith('--url='));
// --serve-only: serve site/ and stay up (used by playwright.config.ts webServer)
const serveOnly = process.argv.includes('--serve-only');
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
  if (serveOnly) {
    console.log(`serving site/ in-process on :${PORT} (serve-only — Ctrl+C to stop)`);
    await new Promise(() => {}); // stay alive for an external runner (playwright test)
  }
}

const only = process.argv.slice(2).filter(a => !a.startsWith('--'))[0] || null;
const sections = ['smoke', 'panel', 'edits', 'undo', 'layouts', 'tours', 'route', 'options', 'characters'].filter(s => !only || s === only);

const results = [];
let page, browser;
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};
const errors = [];

async function boot(hash = '', search = '') {
  await page.goto(`${BASE}/${search}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

// Click a genuinely empty spot on the canvas so the tap reaches the background
// (target === cy), not a node or an edge — otherwise the check would pass
// without exercising the background-tap handler at all. The graph can be zoomed
// past the viewport, so we sample points inside #cy and keep clear of every
// visible node and of every edge (haystack edges are straight, so a point far
// from the center-to-center segment is far from the drawn edge).
async function tapEmptyCanvas() {
  const pt = await page.evaluate(() => {
    const cy = window.__cy;
    const W = cy.width(), H = cy.height();
    const nodes = cy.nodes(':visible').map(n => n.renderedPosition());
    const segs = cy.edges(':visible').map(e => [e.source().renderedPosition(), e.target().renderedPosition()]);
    const segDist = (px, py, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    };
    const host = document.getElementById('cy');
    const r = host.getBoundingClientRect();
    const NODE_CLEAR = 26, EDGE_CLEAR = 6;
    for (let i = 0; i < 6000; i++) {
      const x = 20 + Math.random() * (W - 40);
      const y = 20 + Math.random() * (H - 40);
      let ok = true;
      for (const p of nodes) {
        if (Math.abs(p.x - x) < NODE_CLEAR && Math.abs(p.y - y) < NODE_CLEAR &&
            Math.hypot(p.x - x, p.y - y) < NODE_CLEAR) { ok = false; break; }
      }
      if (!ok) continue;
      for (const s of segs) { if (segDist(x, y, s[0], s[1]) < EDGE_CLEAR) { ok = false; break; } }
      if (!ok) continue;
      const el = document.elementFromPoint(r.x + x, r.y + y);
      if (el && host.contains(el)) return { x: r.x + x, y: r.y + y };
    }
    return null;
  });
  if (!pt) throw new Error('no empty canvas point found');
  await page.mouse.click(pt.x, pt.y);
}

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

  await page.click('#btnRequires');
  await page.waitForTimeout(500);
  ok('requires highlights', await page.evaluate(() => window.__cy.elements('.highlighted').length > 0));

  // ⏱ P24: a blank-space click must NOT alter the graph — the requires highlight
  // survives it (it used to call clearHighlight and restore the full map)
  const tapState = () => page.evaluate(() => ({
    highlighted: window.__cy.elements('.highlighted').length,
    faded: window.__cy.elements('.faded').length,
    visible: window.__cy.nodes(':visible').length,
    anchorSelected: window.__cy.getElementById('Iron Bar').hasClass('sel'),
    panelOpen: document.getElementById('panel').classList.contains('open'),
  }));
  const beforeTap = await tapState();
  await tapEmptyCanvas();
  await page.waitForTimeout(400);
  const afterTap = await tapState();
  ok('background tap keeps the requires highlight',
    beforeTap.highlighted > 0 && afterTap.highlighted === beforeTap.highlighted,
    `${beforeTap.highlighted} -> ${afterTap.highlighted} highlighted`);
  ok('background tap keeps the faded rest of the map',
    beforeTap.faded > 0 && afterTap.faded === beforeTap.faded,
    `${beforeTap.faded} -> ${afterTap.faded} faded`);
  ok('background tap keeps the same nodes visible',
    afterTap.visible === beforeTap.visible, `${beforeTap.visible} -> ${afterTap.visible} visible`);
  ok('background tap leaves the highlighted anchor selected', afterTap.anchorSelected,
    `anchor .sel ${beforeTap.anchorSelected} -> ${afterTap.anchorSelected}`);
  ok('background tap leaves the panel open', afterTap.panelOpen);

  // ⏱ P23: step-back button shrinks the highlight one level; reset clears it
  await page.click('#btnEnables'); // grow a second level (downward)
  await page.waitForTimeout(500);
  const depth2 = await page.evaluate(() => window.__cy.elements('.highlighted').length);
  ok('enables grows the frontier', depth2 > 0);
  await page.click('#btnStepBack');
  await page.waitForTimeout(500);
  const depth1 = await page.evaluate(() => window.__cy.elements('.highlighted').length);
  ok('step back shrinks the highlight by one level', depth1 < depth2,
    `depth ${depth2} -> ${depth1} highlighted elements`);
  await page.click('#btnResetHighlight');
  await page.waitForTimeout(500);
  ok('reset removes all highlights', await page.evaluate(() => window.__cy.elements('.highlighted').length === 0));

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

  // "only" solo-filter: the clicked kind must stay visible (regression — it
  // deleted every kind including its own, blanking the whole map)
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('span:last-child')?.textContent === 'Food')
      .querySelector('.lg-only').click();
  });
  await page.waitForTimeout(700);
  const solo = await page.evaluate(() => {
    let food = 0, others = 0;
    window.__cy.nodes(':visible').forEach(n => { n.data('meta').kind === 'food' ? food++ : others++; });
    return { food, others };
  });
  ok('"only" keeps the clicked kind visible', solo.food > 0, `${solo.food} food node(s) visible`);
  ok('"only" hides every other kind', solo.others === 0, `${solo.others} non-food node(s) visible`);
  // a second click restores every kind
  await page.evaluate(() => {
    [...document.querySelectorAll('#legend .lg-row')]
      .find(r => r.querySelector('span:last-child')?.textContent === 'Food')
      .querySelector('.lg-only').click();
  });
  await page.waitForTimeout(700);
  const restored = await page.evaluate(() => {
    let others = 0;
    window.__cy.nodes(':visible').forEach(n => { if (n.data('meta').kind !== 'food') others++; });
    return others;
  });
  ok('a second "only" click restores every kind', restored > 0, `${restored} non-food node(s) visible again`);
}

/* ── panel ─────────────────────────────────────────────────────────────── */
async function secPanel() {
  console.log('panel:');
  await clearStorage(['dw.owned']);
  await boot();

  // search results carry a right-aligned favourite star that marks the recipe
  // owned in place (like the panel's ✓ Owned) without picking the result
  await page.fill('#search', 'Iron Bar');
  await page.waitForTimeout(400);
  ok('search result has an owned star', (await page.$$('.sug-item .sug-own')).length > 0);
  ok('star starts empty', (await page.$eval('.sug-item .sug-own', el => el.textContent.trim())) === '☆');
  await page.click('.sug-item .sug-own');
  await page.waitForTimeout(400);
  ok('star marks the item owned', await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('dw.owned') || '[]')).includes('Iron Bar')));
  ok('star fills when owned', (await page.$eval('.sug-item .sug-own', el => el.textContent.trim())) === '★');
  ok('star does not open the panel', await page.$eval('#panel', el => !el.classList.contains('open')));
  await page.click('.sug-item .sug-own');
  await page.waitForTimeout(400);
  ok('star unmarks on a second click', await page.evaluate(() =>
    !(JSON.parse(localStorage.getItem('dw.owned') || '[]')).includes('Iron Bar')));

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

  // recipe-unlock ledger (P3-6): blueprint items teach their recipes when obtained
  await page.fill('#search', 'PLAN: Wooden Barrel');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const unlockTxt = await page.$eval('#panelBody', el => {
    const sec = [...el.querySelectorAll('.p-section')]
      .find(s => s.querySelector('.p-label')?.textContent.includes('Unlocks when obtained'));
    return sec ? sec.innerText : '';
  });
  ok('blueprint item shows what it unlocks', unlockTxt.includes('Wooden Barrel'), unlockTxt.split('\n').slice(0, 3).join(' | '));
  ok('unlock section explains the mechanic', unlockTxt.includes('automatically'));
  await page.fill('#search', 'Commemorative Coin');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  ok('vestige-like item unlocks its recipe', await page.$eval('#panelBody', el =>
    [...el.querySelectorAll('.used-row')].some(r => r.textContent.includes('Amulet of Glory'))));
  await page.fill('#search', 'Wooden Barrel');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  ok('recipe card names the unlock item', await page.$eval('#panelBody', el =>
    [...el.querySelectorAll('.recipe-unlock')].some(c => c.textContent.includes('PLAN: Wooden Barrel'))));
}

/* ── edits (in-app data editing, P6-1) ─────────────────────────────────── */
async function secEdits() {
  console.log('edits:');
  await clearStorage(['dw.edits']);
  await boot();

  // open a node and flip the codex into its edit form
  await page.fill('#search', 'Iron Bar');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  ok('codex has an Edit data button', (await page.$('#btnEditData')) !== null);
  await page.click('#btnEditData');
  await page.waitForTimeout(200);
  ok('edit form opens', (await page.$('#peName')) !== null);

  // change the name + description and save
  const original = await page.$eval('#peName', el => el.value);
  await page.fill('#peName', 'Iron Bar ✎');
  await page.fill('#peDesc', 'Edited by the test suite.');
  await page.click('#peSave');
  await page.waitForTimeout(400);
  ok('panel title shows the edited name', (await page.$eval('#panelTitle', el => el.textContent)) === 'Iron Bar ✎');
  ok('graph label follows the edit', await page.evaluate(() =>
    window.__cy.getElementById('Iron Bar').data('label') === 'Iron Bar ✎'));
  ok('edit persisted in the browser', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('dw.edits') || '{}').nodes?.['Iron Bar']?.name === 'Iron Bar ✎'));

  // the edits window lists the difference between this browser and the bundle
  await page.click('#settingsBtn');
  await page.waitForTimeout(250);
  ok('settings entry shows the edit count', (await page.$eval('#editsCount', el => el.textContent)).trim() === '1');
  await page.click('#editsBtn');
  await page.waitForTimeout(250);
  ok('edits window opens', await page.$eval('#editsModal', el => !el.hidden));
  ok('edits window lists the changed node', await page.$eval('#editsList', el => el.innerText.includes('Iron Bar ✎')));
  ok('edits window shows a field diff', await page.$eval('#editsList', (el, orig) =>
    [...el.querySelectorAll('.edit-diff')].some(d => d.textContent.includes(orig) && d.textContent.includes('Iron Bar ✎')), original));
  ok('edits window offers a per-row revert', await page.$eval('.edits-node .ed-revert', el => !el.disabled));
  await page.click('#editsClose');
  await page.waitForTimeout(200);

  // an edit the shipped dataset has caught up with is flagged + announced
  await clearStorage(['dw.edits']); // navigates, so the origin is available
  await page.evaluate(() => localStorage.setItem('dw.edits', JSON.stringify({ nodes: { 'Iron Bar': { name: 'Iron Bar' } } })));
  await boot();
  ok('merged edit is announced', (await page.$eval('#toast', el => el.textContent)).includes('added to the dataset'));
  await page.click('#settingsBtn');
  await page.waitForTimeout(250);
  await page.click('#editsBtn');
  await page.waitForTimeout(250);
  ok('merged edit is marked in the window', await page.$eval('#editsList', el => el.textContent.includes('in dataset')));
  ok('merged edit shows no field diff', (await page.$$('.edits-node .edit-diff')).length === 0);

  // Clear all removes the overlay and reloads from the bundle
  await page.click('#editsClear');
  await page.waitForFunction(() => !localStorage.getItem('dw.edits'), null, { timeout: 20000 });
  await boot();
  ok('clear-all wipes the overlay', await page.evaluate(() => localStorage.getItem('dw.edits') === null));
  ok('clear-all restores the bundled name', await page.evaluate(() =>
    window.__cy.getElementById('Iron Bar').data('label') === 'Iron Bar'));

  // Reset to bundled from the edit form also drops the entry
  await page.fill('#search', 'Iron Bar');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.click('#btnEditData');
  await page.waitForTimeout(200);
  await page.fill('#peName', 'Iron Bar ✎✎');
  await page.click('#peSave');
  await page.waitForTimeout(400);
  await page.click('#btnEditData');
  await page.waitForTimeout(200);
  await page.click('#peReset');
  await page.waitForFunction(() => !localStorage.getItem('dw.edits'), null, { timeout: 20000 });
  await boot();
  ok('reset-to-bundled drops the edit', await page.evaluate(() => localStorage.getItem('dw.edits') === null));
}

/* ── undo ──────────────────────────────────────────────────────────────── */
async function secUndo() {
  console.log('undo:');
  await clearStorage(['dw.autoRelayout']);
  await boot();

  await openSettings();
  await page.waitForTimeout(200);
  // native popover (top layer) or legacy hidden-attr fallback — both must read "open"
  ok('⚙ opens the settings panel', await page.$eval('#settingsPanel',
    el => el.matches(':popover-open') || !el.hidden));
  ok('algorithm select lives in the panel', await page.$eval('#settingsPanel', el => !!el.querySelector('#layoutSelect')));
  ok('density row lives in the panel', await page.$eval('#settingsPanel', el => !!el.querySelector('#densWrap')));
  await page.mouse.click(400, 500); // real pointer click outside — light dismiss closes it
  await page.waitForTimeout(200);
  ok('outside click closes it', await page.$eval('#settingsPanel',
    el => !el.matches(':popover-open'))); // UA hides popovers via display:none, not [hidden]

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

  // ⏱ last-layout readout: header shows duration + node count of the last layout
  await page.waitForFunction(() => !document.getElementById('layoutInd')?.classList.contains('on'), null, { timeout: 60000, polling: 250 });
  await page.waitForTimeout(300);
  ok('last-layout readout appears after boot layout', await page.evaluate(() => {
    const el = document.getElementById('lastLayout');
    return !!el && /last layout: [\d.]+s · [\d,]+ nodes/.test(el.textContent);
  }), await page.$eval('#lastLayout', el => el.textContent).catch(() => '(absent)'));
  const lastLayoutText1 = await page.$eval('#lastLayout', el => el.textContent).catch(() => '');

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
  ok('last-layout readout refreshes after a recompute', await page.evaluate(t1 => {
    const el = document.getElementById('lastLayout');
    return !!el && el.textContent !== t1;
  }, lastLayoutText1), await page.$eval('#lastLayout', el => el.textContent).catch(() => '(absent)'));

  // ⏱ P21/P22: highlight buttons GROW the visible tree — after an isolation (only
  // the subtree visible), Requires must REVEAL the hidden ingredients (the
  // old code only highlighted, so hidden nodes changed nothing on screen)
  await page.evaluate(() => { window.isolateTree('Bread', 1); });
  await page.waitForTimeout(2500); // isolation reflow settles
  const isoShown = await page.evaluate(() => window.__cy.nodes(':visible').length);
  await page.evaluate(() => { window.selectNode('Bread'); document.getElementById('btnRequires').click(); });
  await page.waitForTimeout(600);
  const afterRequires = await page.evaluate(() => window.__cy.nodes(':visible').length);
  ok('requires reveals hidden nodes (grows the isolated tree)', afterRequires > isoShown,
    `isolation ${isoShown} -> requires ${afterRequires} nodes`);
  await page.evaluate(() => { document.getElementById('btnRequires').click(); });
  await page.waitForTimeout(600);
  const afterRequires2 = await page.evaluate(() => window.__cy.nodes(':visible').length);
  ok('second requires click expands one more level (cumulative)', afterRequires2 > afterRequires,
    `${afterRequires} -> ${afterRequires2} nodes`);
  // ⏱ P23: step back after growth should shrink the visible highlight by one level
  await page.evaluate(() => { document.getElementById('btnStepBack').click(); });
  await page.waitForTimeout(600);
  const afterStepBack = await page.evaluate(() => window.__cy.nodes(':visible').length);
  ok('step back shrinks the isolated+highlighted tree by one level', afterStepBack < afterRequires2,
    `depth ${afterRequires2} -> ${afterStepBack} visible nodes`);
  // cleanup: Esc clears highlight + isolation; re-show everything for the dagre section
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.showEverything());
  await page.waitForTimeout(6500); // settle the restore reflow
  // dagre bounds are asserted on the FULL map: the bundled/curated dagre
  // snapshot and a fresh live dagre agree there (h > w, deterministic), while
  // an isolated subtree fans out wide and low — h > w simply doesn't hold for
  // 89 nodes in few layers, and racing reflows made the old assertion flaky
  await closeSettings(); // Esc must not hit the open panel
  await page.keyboard.press('Escape'); // clear isolation
  await page.waitForTimeout(6500); // let the isolation-exit reflow settle

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
  // wait for the Arranging pill to turn OFF — a fixed 3s raced the worker on
  // slower hosts and measured the previous arrangement's bounds
  await page.waitForFunction(() => !document.getElementById('layoutInd')?.classList.contains('on'), null, { timeout: 45000, polling: 250 }).catch(() => {});
  await page.waitForTimeout(400);
  const dagre = await page.evaluate(() => {
    const bb = window.__cy.nodes(':visible').boundingBox({});
    return { w: Math.round(bb.w), h: Math.round(bb.h), n: window.__cy.nodes(':visible').length, algo: document.getElementById('layoutMeta').textContent };
  });
  ok('dagre TB applied (layered bounds)', dagre.h > dagre.w && dagre.w > 0, `w=${dagre.w} h=${dagre.h} n=${dagre.n}`);
  ok('readout shows dagre', /dagre/.test(dagre.algo));
  await page.screenshot({ path: 'cache/shots-ui/layout-dagre.png' });

  await page.evaluate(() => { document.getElementById('animToggle').checked = true; document.getElementById('animToggle').onchange(); }); // restore

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

  // explicit layout selection on an ISOLATED view must arrange only the visible
  // nodes AND bypass saved snapshots: a bundled/curated full-map snapshot holds
  // every node where the whole map put it (the subtree never re-tightens) and
  // drags the hidden majority along too. Selecting a preset that ships a bundled
  // snapshot (elk-layered) while isolated must therefore recompute live on the
  // visible subtree. A clean boot keeps the long runs above from racing this
  // one, and saved positions stays ON — that is the whole point of the bypass.
  await clearStorage(['dw.customLayouts']);
  // boot from the instant (snapshot) default — a slow preset left over from the
  // checks above would block the single-threaded worker and stall this block
  await page.evaluate(() => localStorage.setItem('dw.layout', 'elk-layered-wide'));
  await boot();
  await page.evaluate(() => window.isolateTree('Bread', 1));
  await page.waitForTimeout(1500);
  const isoVisible = await page.evaluate(() => window.__cy.nodes(':visible').length);
  // settle the isolation reflow (already live on the visible subtree — graph-
  // change reflows pass skipSaved)
  await page.waitForFunction(v => {
    const m = /last layout: [\d.]+s · ([\d,]+) nodes/.exec(document.getElementById('lastLayout')?.textContent || '');
    return m && Number(m[1].replace(/,/g, '')) === v;
  }, isoVisible, { timeout: 45000, polling: 250 }).catch(() => {});
  const hiddenBefore = await page.evaluate(() => {
    const hidden = window.__cy.nodes('.hidden');
    const n = hidden.filter(x => Math.abs(x.position('x')) + Math.abs(x.position('y')) > 2)[0] || hidden[0];
    return n ? { id: n.id(), x: n.position('x'), y: n.position('y') } : null;
  });
  await openSettings();
  ok('isolated view keeps saved positions ON', await page.$eval('#savedToggle', el => el.checked));
  await closeSettings();
  // clear any prior toast so we can prove this selection emits none: a valid
  // small isolated arrangement used to be rejected by the flat >400px snapshot
  // sanity floor, so its worker result was discarded and the fallback main run
  // fired "Worker layout returned a degenerate result" then "made no changes".
  await page.evaluate(() => { const t = document.getElementById('toast'); t.classList.remove('show'); t.dataset.msg = ''; });
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'elk-layered'; // ships a bundled snapshot in layouts/manifest.js
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => !document.getElementById('layoutInd')?.classList.contains('on'), null, { timeout: 45000, polling: 250 }).catch(() => {});
  await page.waitForTimeout(400);
  const isoToast = await page.evaluate(() => document.getElementById('toast')?.dataset.msg || '');
  ok('isolated explicit selection arranges without spurious toasts',
    !/degenerate|made no changes/.test(isoToast), `toast="${isoToast}"`);
  const isoRaw = await page.evaluate(() => document.getElementById('lastLayout')?.textContent || '(absent)');
  const isoArranged = await page.evaluate(() => {
    const m = /last layout: [\d.]+s · ([\d,]+) nodes/.exec(document.getElementById('lastLayout')?.textContent || '');
    return m ? Number(m[1].replace(/,/g, '')) : -1;
  });
  ok('isolated explicit selection arranges only the visible nodes', isoArranged === isoVisible && isoVisible > 1 && isoVisible < 200,
    `arranged=${isoArranged} visible=${isoVisible} raw="${isoRaw}"`);
  await openSettings();
  const isoNote = await page.$eval('#snapshotNote', el => el.textContent);
  await closeSettings();
  ok('isolated explicit selection bypasses the saved snapshot', /isolated view/.test(isoNote), isoNote);
  const hiddenAfter = hiddenBefore && await page.evaluate(id => {
    const p = window.__cy.getElementById(id).position();
    return { x: p.x, y: p.y };
  }, hiddenBefore.id);
  ok('isolated explicit selection leaves hidden nodes in place',
    !!hiddenBefore && hiddenAfter.x === hiddenBefore.x && hiddenAfter.y === hiddenBefore.y,
    hiddenBefore ? `${hiddenBefore.id}: (${hiddenBefore.x},${hiddenBefore.y}) -> (${hiddenAfter.x},${hiddenAfter.y})` : 'no hidden node');
  await page.keyboard.press('Escape'); // clear isolation (panel is closed)
  await page.evaluate(() => window.showEverything());
  await page.waitForTimeout(3000);

  // explicit selection must RUN even with "re-layout on graph change" OFF — an
  // inverted runLayout gate once silently dropped every request when it was off.
  // Boot the instant default again, turn the option OFF, then ISOLATE (no reflow
  // fires), so the recorded arrangement is still the full-map one; selecting a
  // layout must then re-record with the isolated subtree's node count.
  await clearStorage(['dw.customLayouts']);
  await page.evaluate(() => localStorage.setItem('dw.layout', 'elk-layered-wide'));
  await boot();
  await openSettings();
  await page.evaluate(() => { const t = document.getElementById('autoRelayout'); t.checked = false; t.onchange(); });
  await closeSettings();
  await page.waitForTimeout(300);
  const countFromReadout = () => {
    const m = /last layout: [\d.]+s · ([\d,]+) nodes/.exec(document.getElementById('lastLayout')?.textContent || '');
    return m ? Number(m[1].replace(/,/g, '')) : -1;
  };
  const beforeOff = await page.evaluate(countFromReadout);
  await page.evaluate(() => window.isolateTree('Bread', 1));
  await page.waitForTimeout(1500);
  const isoOffVisible = await page.evaluate(() => window.__cy.nodes(':visible').length);
  const afterIsolate = await page.evaluate(countFromReadout);
  ok('isolation does not reflow with auto-relayout OFF', afterIsolate === beforeOff,
    `before=${beforeOff} after-isolation=${afterIsolate}`);
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'grid'; // deterministic and instant
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => !document.getElementById('layoutInd')?.classList.contains('on'), null, { timeout: 45000, polling: 250 }).catch(() => {});
  await page.waitForTimeout(400);
  const afterSelect = await page.evaluate(countFromReadout);
  ok('selecting a layout with auto-relayout OFF still records a completion',
    afterSelect === isoOffVisible && isoOffVisible > 1 && afterSelect !== beforeOff,
    `selected=${afterSelect} visible=${isoOffVisible} before=${beforeOff}`);

  // back to a clean state: default preset, auto-relayout ON
  await page.keyboard.press('Escape'); // clear isolation
  await page.evaluate(() => window.showEverything());
  await page.waitForTimeout(2000);
  await openSettings();
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'elk-layered-wide';
    sel.dispatchEvent(new Event('change'));
    const t = document.getElementById('autoRelayout');
    t.checked = true; t.onchange();
  });
  await page.waitForTimeout(3000);
  await closeSettings();
}

/* ── tours ─────────────────────────────────────────────────────────────── */
async function secTours() {
  console.log('tours:');
  await boot();

  await page.click('#helpBtn');
  await page.waitForTimeout(200);
  ok('help window lists the guided tours', (await page.$$('.h-tour')).length === 4);

  await page.click('.h-tour.gold');
  await page.waitForSelector('.driver-popover', { timeout: 10000 });
  ok('main tour starts from the help window',
    (await page.$eval('.driver-popover-title', el => el.textContent)).includes('Welcome'));

  const next = async () => { await page.click('.driver-popover-next-btn'); await page.waitForTimeout(450); };
  await next(); await next(); // → the map step, whose action opens Iron Bar
  await page.waitForTimeout(500);
  ok('tour actions drive the app (codex opens)',
    (await page.$eval('#panelTitle', el => el.textContent)) === 'Iron Bar');

  await next(); await next(); // → isolate step
  await page.waitForTimeout(900);
  const iso = await page.evaluate(() => ({ shown: window.__cy.nodes(':visible').length, total: window.__cy.nodes().length }));
  ok('isolate step collapses to the subtree', iso.shown < 200 && iso.shown > 10, `${iso.shown}/${iso.total}`);

  let guard = 0;
  while (await page.$('.driver-popover') && guard++ < 14) await next();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    shown: window.__cy.nodes(':visible').length,
    total: window.__cy.nodes().length,
    search: document.getElementById('search').value,
    gone: !document.querySelector('.driver-popover'),
  }));
  ok('closing the tour restores the full view', after.shown === after.total && after.search === '' && after.gone);

  await page.evaluate(() => window.DW_TOURS.start('robes'));
  await page.waitForSelector('.driver-popover', { timeout: 10000 });
  await next(); // types "mage robes"
  ok('robes tour types the search',
    (await page.$eval('#search', el => el.value)) === 'mage robes'
    && await page.$eval('#suggestions', el => el.classList.contains('open')));
  await next(); // opens the codex
  await page.waitForTimeout(500);
  ok('robes tour opens the codex',
    (await page.$eval('#panelTitle', el => el.textContent)) === 'Dark Mage Robes');
  await page.click('.driver-popover-close-btn');
  await page.waitForTimeout(700);
  ok('mini-tour close cleans up', await page.evaluate(() =>
    document.getElementById('search').value === '' && window.__cy.nodes(':visible').length === window.__cy.nodes().length));

  await page.goto(`${BASE}/?tour=outputs`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cy && document.getElementById('veil').classList.contains('hidden'), null, { timeout: 120000, polling: 500 });
  await page.waitForSelector('.driver-popover', { timeout: 15000 });
  ok('?tour= deep link auto-starts',
    (await page.$eval('.driver-popover-title', el => el.textContent)).includes('Ash Logs'));
}

/* ── route (hash deep links) ───────────────────────────────────────────── */
async function secRoute() {
  console.log('route:');

  // #/<item> — a one-segment route selects that item
  await boot('#/ash_logs');
  const one = await page.evaluate(() => ({
    title: document.getElementById('panelTitle').textContent,
    hash: location.hash,
  }));
  ok('#/ash_logs selects the item', one.title === 'Ash Logs', one.title);
  ok('#/ash_logs keeps the fragment in the URL', one.hash === '#/ash_logs', one.hash);

  // #/<from>/<to> — a two-segment route draws the path between them
  await boot('#/ash_logs/iron_sword');
  const path = await page.evaluate(() => ({
    title: document.getElementById('panelTitle').textContent,
    highlighted: window.__cy.edges('.highlighted').length,
    bar: !document.getElementById('pathbar').classList.contains('hidden'),
  }));
  ok('#/ash_logs/iron_sword opens the target panel', path.title === 'Iron Sword', path.title);
  ok('#/ash_logs/iron_sword draws the gold trail', path.highlighted >= 2, `${path.highlighted} highlighted edges`);
  ok('#/ash_logs/iron_sword shows the path bar', path.bar);

  // selecting an item writes its slug back into the address bar
  await boot();
  await page.evaluate(() => window.selectNode('Iron Bar'));
  await page.waitForTimeout(400);
  ok('selecting an item writes its slug to the URL',
    (await page.evaluate(() => location.hash)) === '#/iron_bar');

  // editing the fragment navigates in place (no reload) — the hashchange path
  await boot();
  await page.evaluate(() => { location.hash = '#/ash_logs'; });
  await page.waitForFunction(
    () => document.getElementById('panelTitle').textContent === 'Ash Logs',
    null, { timeout: 10000, polling: 100 }).catch(() => {});
  ok('editing the URL fragment navigates in place',
    (await page.$eval('#panelTitle', el => el.textContent)) === 'Ash Logs');

  // a bogus slug is reported, not fatal
  await boot('#/not_a_real_item');
  const bogus = await page.waitForFunction(() => {
    const t = document.getElementById('toast');
    return /nothing matches/i.test(t.textContent) && t.classList.contains('show');
  }, null, { timeout: 10000, polling: 100 }).then(() => true).catch(() => false);
  ok('an unknown slug is reported, not fatal', bogus);
}

/* ── characters (per-character state, TODO #24) ─────────────────────────── */
async function secCharacters() {
  console.log('characters:');
  // every key a character owns, so a fresh run starts genuinely clean
  const CLEAR = ['dw.characters', 'dw.charPrompted', 'dw.layout', 'dw.owned',
    'dw.legendKinds', 'dw.showOrphans', 'dw.dens', 'dw.animate', 'dw.savedLayouts',
    'dw.worker', 'dw.autoRelayout', 'dw.showMatEdges', 'dw.showSkillEdges',
    'dw.showRegionEdges', 'dw.isoDepth', 'dw.isoDir', 'dw.highlight', 'dw.planMode',
    'dw.planUseOwned', 'dw.wpProgress', 'dw.force'];
  const waitBoot = async () => {
    await page.waitForFunction(() => window.__cy && window.__cy.nodes().length > 0, null, { timeout: 120000, polling: 500 });
    await page.waitForFunction(() => document.getElementById('veil').classList.contains('hidden'), null, { timeout: 60000, polling: 250 });
    await page.waitForTimeout(700);
  };
  // create/switch/delete reload the page — wait for the navigation itself,
  // not just the boot conditions (which the old document already satisfies)
  const reloadClick = async (sel) => {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      page.click(sel),
    ]);
    await waitBoot();
  };
  // blur first: a real click on the header button right after editing the
  // focused skill input can be swallowed by the harness; a user's mousedown
  // would blur it, so mimic that rather than losing the click
  const openCharPanel = async () => {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await page.click('#charBtn');
    await page.waitForTimeout(250);
  };
  const activeName = () => page.evaluate(() => (window.DW_CHARACTERS.activeCharacter() || {}).name || null);

  // 1. existing saved data with no character → the migration prompt offers to attach it
  await clearStorage(CLEAR);
  await page.evaluate(() => {
    localStorage.setItem('dw.layout', 'grid');
    localStorage.setItem('dw.owned', JSON.stringify(['Iron Sword']));
  });
  await boot();
  const mig = await page.evaluate(() => ({
    open: !document.getElementById('charModal').hidden,
    adopt: !document.getElementById('charModalAdoptWrap').hidden,
  }));
  ok('existing data with no character asks to attach it', mig.open && mig.adopt, `open=${mig.open} adopt=${mig.adopt}`);
  await page.fill('#charModalName', 'Legacy');
  await reloadClick('#charModalCreate');
  const legacy = await page.evaluate(() => ({
    modal: !document.getElementById('charModal').hidden,
    active: (window.DW_CHARACTERS.activeCharacter() || {}).name,
    layoutValue: document.getElementById('layoutSelect').value,
    stored: localStorage.getItem('dw.layout'),
  }));
  ok('attaching keeps the saved data with the character',
    legacy.active === 'Legacy' && legacy.stored === 'grid' && legacy.layoutValue === 'grid',
    `${legacy.active} stored=${legacy.stored} layout=${legacy.layoutValue}`);
  ok('the prompt does not reappear once answered', legacy.modal === false);

  // 2. skipping is remembered, and the atlas still works without a character
  await clearStorage(CLEAR);
  await boot();
  ok('a fresh visitor is asked to name a character', await page.$eval('#charModal', el => !el.hidden));
  await page.evaluate(() => document.getElementById('charModalSkip').click());
  await page.waitForTimeout(200);
  const skipped = await page.evaluate(() => ({
    hidden: document.getElementById('charModal').hidden,
    prompted: localStorage.getItem('dw.charPrompted'),
    active: !!window.DW_CHARACTERS.activeCharacter(),
  }));
  ok('skipping hides the prompt and is remembered', skipped.hidden && skipped.prompted === '1' && !skipped.active);
  await boot();
  ok('the prompt is not asked twice', await page.$eval('#charModal', el => el.hidden));

  // 3. create a character; the header shows the name and the total level
  await clearStorage(CLEAR);
  await boot();
  await page.fill('#charModalName', 'Alice');
  await reloadClick('#charModalCreate');
  const alice = await page.evaluate(() => ({
    active: (window.DW_CHARACTERS.activeCharacter() || {}).name,
    total: window.DW_CHARACTERS.totalLevel(window.DW_CHARACTERS.activeCharacter().skills),
    btn: document.getElementById('charBtn').textContent,
  }));
  ok('creating a character makes it active', alice.active === 'Alice');
  ok('the header shows the name and the total level', /Alice/.test(alice.btn) && alice.total === 12, `${alice.btn} / total ${alice.total}`);
  // the character control is labelled for screen readers
  ok('the character control is labelled', (await page.$eval('#charBtn', el => el.getAttribute('aria-label'))) === 'Character');

  // 4. a skill hub tracks its own level; editing it updates the total
  await page.evaluate(() => window.selectNode('Artisan'));
  await page.waitForTimeout(500);
  ok('a skill hub panel offers a level input', (await page.$('#skillLevelInput')) !== null);
  await page.fill('#skillLevelInput', '20');
  await page.dispatchEvent('#skillLevelInput', 'change');
  await page.waitForTimeout(300);
  const lvl = await page.evaluate(() => ({
    total: window.DW_CHARACTERS.totalLevel(window.DW_CHARACTERS.activeCharacter().skills),
    btn: document.getElementById('charBtn').textContent,
    label: window.__cy.getElementById('Artisan').data('label'),
  }));
  ok('editing a level updates the total', lvl.total === 31, `total ${lvl.total}`);
  ok('the header total follows the edit', /31/.test(lvl.btn), lvl.btn);
  ok('the skill hub label shows the tracked level', lvl.label === 'Artisan · 20', lvl.label);

  // 5. per-character state: Alice keeps her grid + owned item; a new character is clean
  await page.evaluate(() => {
    localStorage.setItem('dw.layout', 'grid');
    localStorage.setItem('dw.owned', JSON.stringify(['Iron Sword']));
    localStorage.setItem('dw.force', '0'); // a per-character pref (P3-2)
  });
  await openCharPanel();
  await page.fill('#charNewName', 'Bob');
  await reloadClick('#charCreate');
  const bob = await page.evaluate(() => ({
    active: (window.DW_CHARACTERS.activeCharacter() || {}).name,
    layout: document.getElementById('layoutSelect').value,
    owned: JSON.parse(localStorage.getItem('dw.owned') || '[]'),
    force: localStorage.getItem('dw.force'),
  }));
  ok('a new character starts from a clean slate',
    bob.active === 'Bob' && bob.layout === 'elk-layered-wide' && bob.owned.length === 0 && bob.force === null,
    `${bob.active} layout=${bob.layout} owned=${bob.owned.length} force=${bob.force}`);

  // 6. switching back restores that character's own graph state
  await openCharPanel();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    page.click('.char-row:has-text("Alice")'),
  ]);
  await waitBoot();
  const back = await page.evaluate(() => ({
    active: (window.DW_CHARACTERS.activeCharacter() || {}).name,
    layoutValue: document.getElementById('layoutSelect').value,
    owned: JSON.parse(localStorage.getItem('dw.owned') || '[]'),
    force: localStorage.getItem('dw.force'),
    total: window.DW_CHARACTERS.totalLevel(window.DW_CHARACTERS.activeCharacter().skills),
  }));
  ok('switching restores the character\'s layout', back.active === 'Alice' && back.layoutValue === 'grid', `${back.active} layout=${back.layoutValue}`);
  ok('switching restores the character\'s owned items', back.owned.includes('Iron Sword'));
  ok('switching restores the character\'s force preference', back.force === '0', `force=${back.force}`);
  ok('switching restores the character\'s skill levels', back.total === 31, `total ${back.total}`);

  // 7. deleting the active character falls back to another
  await openCharPanel();
  await reloadClick('#charDelete');
  const afterDel = await page.evaluate(() => ({
    active: (window.DW_CHARACTERS.activeCharacter() || {}).name,
    count: window.DW_CHARACTERS.read().chars.length,
  }));
  ok('deleting the active character falls back', afterDel.active === 'Bob' && afterDel.count === 1, `${afterDel.active} (${afterDel.count} left)`);
  ok('the fallback character is the active one', (await activeName()) === 'Bob');
}

/* ── options (the graph view via query params) ──────────────────────────── */
async function secOptions() {
  console.log('options:');
  const KEYS = ['dw.layout', 'dw.force', 'dw.animate', 'dw.savedLayouts', 'dw.worker', 'dw.dens',
    'dw.autoRelayout', 'dw.legendKinds', 'dw.showOrphans', 'dw.showMatEdges',
    'dw.showSkillEdges', 'dw.showRegionEdges', 'dw.isoDepth', 'dw.isoDir'];
  await boot();
  await clearStorage(KEYS);

  // every option can be set from the URL…
  await boot('', '?layout=grid&force=0&anim=0&saved=0&worker=0&dens=150&auto=0&orphans=1&links=0&skilllinks=1&regions=1&possessions=1&cats=food');
  const o = await page.evaluate(() => ({
    layout: document.getElementById('layoutSelect').value,
    force: document.getElementById('forceToggle').checked,
    anim: document.getElementById('animToggle').checked,
    saved: document.getElementById('savedToggle').checked,
    worker: document.getElementById('workerToggle').checked,
    auto: document.getElementById('autoRelayout').checked,
    dens: document.getElementById('densSlider').value,
    densLabel: document.getElementById('densVal').textContent,
    skillLinks: document.getElementById('edgeSkillChip').classList.contains('on'),
    weaponHidden: window.__cy.getElementById('Iron Sword').hasClass('hidden'),
    foodHidden: window.__cy.getElementById('Meat Stew').hasClass('hidden'),
  }));
  ok('?layout= picks the algorithm', o.layout === 'grid', o.layout);
  ok('?force/?anim/?saved/?worker set their toggles',
    o.force === false && o.anim === false && o.saved === false && o.worker === false);
  ok('?auto=0 turns re-layout-on-change off', o.auto === false);
  ok('?dens= moves the slider and its label', o.dens === '150' && o.densLabel === '150%', `${o.dens} / ${o.densLabel}`);
  ok('?cats=food shows food only', o.weaponHidden === true && o.foodHidden === false,
    `iron sword hidden=${o.weaponHidden}, meat stew hidden=${o.foodHidden}`);
  ok('?skilllinks=1 reveals the gold skill gates', o.skillLinks === true);

  // …and NONE of it is written to storage (that is the difference from the ⚙ panel)
  const stored = await page.evaluate(keys => {
    const out = {};
    for (const k of keys) out[k] = localStorage.getItem(k);
    return out;
  }, KEYS);
  const leaked = Object.entries(stored).filter(([, v]) => v !== null).map(([k]) => k);
  ok('URL options are never persisted', leaked.length === 0, leaked.join(', ') || 'nothing stored');

  // …and the URL is rewritten as a complete, shareable description of the view
  const q = await page.evaluate(() => [...new URLSearchParams(location.search).keys()]);
  ok('the URL carries every option', q.length >= 15 && q.includes('layout') && q.includes('cats') && q.includes('isodepth'),
    `${q.length} params`);

  // a change made by hand updates the URL live AND persists, as it always did
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#legend .lg-row')].find(r => r.textContent.includes('Weapons'));
    row.click();
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    cats: new URLSearchParams(location.search).get('cats'),
    stored: localStorage.getItem('dw.legendKinds'),
  }));
  ok('a manual change updates the URL live', !!after.cats && after.cats.includes('weapon'), after.cats);
  ok('a manual change still persists as before', !!after.stored && after.stored.includes('weapon'), after.stored);

  // the force-directed toggle persists too (P3-2) — it was memory-only before,
  // so this is the check that would have caught the missing dw.force key
  await clearStorage(['dw.force', 'dw.layout']);
  await page.evaluate(() => {
    localStorage.setItem('dw.layout', 'cose-bilkent'); // a force layout ⇒ the toggle is live
    localStorage.setItem('dw.settingsOpen', '1');       // …and it lives in the ⚙ panel
  });
  await boot();
  ok('the force toggle is live on a force layout', await page.$eval('#forceToggle', el => el.disabled === false));
  await page.click('#forceToggle');
  await page.waitForTimeout(300);
  const fPref = await page.evaluate(() => ({
    stored: localStorage.getItem('dw.force'),
    url: new URLSearchParams(location.search).get('force'),
  }));
  ok('toggling force persists it', fPref.stored === '0', `stored=${fPref.stored}`);
  ok('toggling force keeps the URL current', fPref.url === '0', `force=${fPref.url}`);
  await boot();
  ok('force off survives a reload', await page.$eval('#forceToggle', el => el.checked === false));
  await clearStorage(['dw.force', 'dw.layout']);

  // ?iso= isolates an item on load, with ?isodir=/?isodepth= as its defaults
  await boot('', '?iso=iron_sword&isodepth=1&isodir=up');
  const iso = await page.evaluate(() => ({
    title: document.getElementById('panelTitle').textContent,
    shown: window.__cy.nodes(':visible').length,
    total: window.__cy.nodes().length,
    bc: !document.getElementById('breadcrumb').classList.contains('hidden'),
    iso: new URLSearchParams(location.search).get('iso'),
    dir: new URLSearchParams(location.search).get('isodir'),
    depth: new URLSearchParams(location.search).get('isodepth'),
  }));
  ok('?iso= isolates that item on load', iso.title === 'Iron Sword' && iso.shown > 1 && iso.shown < iso.total,
    `${iso.title}: ${iso.shown}/${iso.total} shown`);
  ok('the isolated view shows its breadcrumb', iso.bc === true);
  ok('an isolated view stays linkable', iso.iso === 'iron_sword' && iso.dir === 'up' && iso.depth === '1',
    `iso=${iso.iso} dir=${iso.dir} depth=${iso.depth}`);

  // a foreign param (?tour=) survives the rewrite
  await boot('', '?tour=outputs&layout=grid');
  const merged = await page.evaluate(() => location.search);
  const mergedQ = new URLSearchParams(merged);
  ok('foreign params such as ?tour= are preserved',
    mergedQ.get('tour') === 'outputs' && mergedQ.get('layout') === 'grid', merged.slice(0, 60));

  // a typo in a shared link is reported rather than silently ignored
  await boot('', '?layout=nonsense');
  const warned = await page.waitForFunction(
    () => /ignoring unknown url option/i.test(document.getElementById('toast').textContent),
    null, { timeout: 10000, polling: 100 }).then(() => true).catch(() => false);
  ok('an unusable option value is reported', warned);
}

try {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().split('\n')[0]); });
  if (!urlArg) console.log(`serving site/ in-process on :${PORT}`);
  console.log(`target: ${BASE}\n`);

  // The first-run character prompt (TODO #24) overlays the viewport, so it would
  // block every other section. Answer it once here — the `characters` section
  // clears the flag itself to exercise the prompt.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('dw.charPrompted', '1'));

  fs.mkdirSync('cache/shots-ui', { recursive: true });

  for (const s of sections) {
    if (s === 'smoke') await secSmoke();
    else if (s === 'panel') await secPanel();
    else if (s === 'edits') await secEdits();
    else if (s === 'undo') await secUndo();
    else if (s === 'layouts') await secLayouts();
    else if (s === 'tours') await secTours();
    else if (s === 'route') await secRoute();
    else if (s === 'options') await secOptions();
    else if (s === 'characters') await secCharacters();
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
