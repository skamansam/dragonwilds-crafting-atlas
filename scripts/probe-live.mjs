// Self-contained live probe. By default serves site/ in-process; pass --url=https://example.com/
// to test an external deployment instead (e.g. production).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = 8490;
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

const errors = [];
const b = await chromium.launch();
const cleanup = async () => { try { await b.close(); } catch {} };
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });
try {
const page = await b.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().split('\n')[0]); });

const positional = process.argv.slice(2).filter(a => !a.startsWith('--url=') && a !== '-v');
const only = positional[0] || null;
const verbose = process.argv.includes('-v');
if (verbose) {
  page.on('request', r => console.log('REQ', r.url().slice(-50)));
  page.on('response', r => console.log('RES', r.status(), r.url().slice(-50)));
  page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(-50), r.failure()?.errorText));
}
let loaded = false;
for (let i = 0; i < 2 && !loaded; i++) {
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'commit', timeout: 20000 });
    await page.waitForFunction(() => window.__cy && window.__cy.nodes().length > 0, null, { timeout: 120000, polling: 500 });
    loaded = true;
  } catch (e) {
    console.log(`load attempt ${i + 1} failed:`, e.message.split('\n')[0]);
    if (i === 1) throw e;
    await page.goto('about:blank').catch(() => {});
    await page.waitForTimeout(1500);
  }
}
await page.waitForFunction(() => window.__cy && window.__cy.nodes().length > 0, null, { timeout: 90000, polling: 500 });
await page.waitForTimeout(2000);

const switchTo = async name => {
  await page.evaluate(n => { document.getElementById('layoutSelect').value = n; document.getElementById('layoutSelect').onchange({ target: { value: n } }); }, name);
};
const bounds = () => page.evaluate(() => {
  const bb = window.__cy.nodes(':visible').boundingBox({});
  return { w: Math.round(bb.w), h: Math.round(bb.h), bad: window.__cy.nodes(':visible').filter(n => !isFinite(n.position().x)).length };
});

if (!only || only === 'euler') {
  await switchTo('euler');
  await page.waitForTimeout(9000);
  console.log('euler:', JSON.stringify(await bounds()));
  await page.screenshot({ path: 'cache/shots2/layout-euler.png' });
}
if (!only || only === 'cola') {
  await switchTo('cola');
  await page.waitForTimeout(2500);
  console.log('cola:', JSON.stringify(await bounds()));
  await page.screenshot({ path: 'cache/shots2/layout-cola.png' });
}
if (!only || only === 'isolate') {
  await switchTo('cose-bilkent');
  await page.waitForTimeout(3500);
  // cytoscape drops the synthetic originalEvent on emit('tap'), so shift-tap
  // can't be simulated that way — call the handler's action directly
  await page.evaluate(() => { window.isolateTree('Iron Bar', null); });
  await page.waitForTimeout(1500);
  const iso = await page.evaluate(() => {
    const c = window.__cy;
    return { visible: c.nodes(':visible').length, sword: c.getElementById('Iron Sword').visible() };
  });
  console.log('isolate Iron Bar:', JSON.stringify(iso));
  await page.screenshot({ path: 'cache/shots2/isolate-ironbar.png' });
}
if (!only || only === 'pf3') {
  // NOTE: no pre-reload layout switch — reloading mid-layout crashes the
  // renderer on constrained boxes and the app re-runs its default after boot.
  // seed the ledger: Iron Bar + Hard Leather owned
  await page.evaluate(() => {
    localStorage.setItem('dw.owned', JSON.stringify(['Iron Bar', 'Hard Leather']));
    localStorage.setItem('dw.planUseOwned', '1');
    window.__ownedReload = true;
  });
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => window.__cy && window.__cy.nodes().length > 0, null, { timeout: 90000, polling: 500 });
  await page.waitForTimeout(1500);
  const count = await page.evaluate(() => document.getElementById('ownedCount').textContent);
  console.log('owned count badge:', count);
  // open Iron Sword panel — plan should split have/need
  await page.evaluate(() => { window.__cy.getElementById('Iron Sword').emit('tap', {}); });
  await page.waitForTimeout(900);
  const plan = await page.evaluate(() => {
    const body = document.getElementById('panelBody');
    const el = body.querySelector('.p-section.plan');
    if (!el) return null;
    const subs = [...el.querySelectorAll('.p-label.sub')].map(s => s.innerText.trim());
    const haveChips = [...el.querySelectorAll('.mat.owned .mn')].map(m => m.textContent);
    const needChips = [...el.querySelectorAll('.recipe-mats .mat:not(.owned) .mn')].map(m => m.textContent).slice(0, 8);
    const modeBtn = document.getElementById('btnPlanMode') && document.getElementById('btnPlanMode').textContent;
    return { title: el.querySelector('.p-label').innerText.split('\n')[0], subs, haveChips, needChips, modeBtn, ownedMode: el.classList.contains('owned-mode') };
  });
  console.log('PF-3 plan Iron Sword:', JSON.stringify(plan, null, 1));
  await page.screenshot({ path: 'cache/shots2/pf3-plan.png' });
  // 3-state cycle: owned -> waypoint -> nothing; verify the waypoint checklist
  await page.evaluate(() => document.getElementById('btnPlanMode').click());
  await page.waitForTimeout(500);
  const wp = await page.evaluate(() => {
    const el = document.querySelector('.p-section.plan.waypoint');
    if (!el) return null;
    const steps = [...el.querySelectorAll('.wp-step')].map(r => ({
      verb: r.querySelector('.wp-verb')?.textContent,
      qty: r.querySelector('.wp-qty')?.textContent,
      name: r.querySelector('.mn')?.textContent,
      fac: r.querySelector('.wp-fac')?.textContent,
    }));
    const prog = el.querySelector('.wp-progress');
    return { title: el.querySelector('.p-label').innerText.split('\n')[0], n: steps.length, steps: steps.slice(0, 6), modeBtn: document.getElementById('btnPlanMode').textContent,
      progress: prog ? prog.querySelector('.wp-count')?.textContent.replace(/\s+/g, ' ').trim() : null,
      replans: prog ? prog.querySelector('.wp-replans')?.textContent.trim() : null };
  });
  console.log('PF-4 waypoint checklist:', JSON.stringify(wp, null, 1));
  await page.screenshot({ path: 'cache/shots2/pf4-waypoint.png' });
  // check off a step -> it should become owned and the checklist re-plan
  const before = await page.evaluate(() => (JSON.parse(localStorage.getItem('dw.owned') || '[]')).length);
  await page.evaluate(() => document.querySelector('.wp-step .wp-box').click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    owned: (JSON.parse(localStorage.getItem('dw.owned') || '[]')).length,
    firstStepName: document.querySelector('.wp-step .mn')?.textContent,
    stillWaypoint: !!document.querySelector('.p-section.plan.waypoint'),
    progress: document.querySelector('.wp-progress .wp-count')?.textContent.replace(/\s+/g, ' ').trim(),
    replans: document.querySelector('.wp-progress .wp-replans')?.textContent.trim(),
  }));
  console.log('PF-4 check-off:', JSON.stringify({ before, after }));
  // progress survives reload
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => window.__cy && window.__cy.nodes().length > 0, null, { timeout: 90000, polling: 500 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__cy.getElementById('Iron Sword').emit('tap', {}); });
  await page.waitForTimeout(700);
  const persisted = await page.evaluate(() => ({
    progress: document.querySelector('.wp-progress .wp-count')?.textContent.replace(/\s+/g, ' ').trim(),
    replans: document.querySelector('.wp-progress .wp-replans')?.textContent.trim(),
  }));
  console.log('PF-4 progress after reload:', JSON.stringify(persisted));
  // reset clears the record
  await page.evaluate(() => document.getElementById('btnWpReset').click());
  await page.waitForTimeout(400);
  const reset = await page.evaluate(() => ({
    progress: document.querySelector('.wp-progress .wp-count')?.textContent.replace(/\s+/g, ' ').trim(),
    replans: document.querySelector('.wp-progress .wp-replans')?.textContent.trim(),
    stored: localStorage.getItem('dw.wpProgress'),
  }));
  console.log('PF-4 progress after reset:', JSON.stringify(reset));
  // uncheck to restore, then cycle waypoint -> nothing
  await page.evaluate(() => document.querySelector('.wp-step .wp-box').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('btnPlanMode').click());
  await page.waitForTimeout(400);
  const reverted = await page.evaluate(() => ({
    haveChips: document.querySelectorAll('.p-section.plan .mat.owned').length,
    modeBtn: document.getElementById('btnPlanMode').textContent,
  }));
  console.log('toggle to nothing:', JSON.stringify(reverted));
  await page.evaluate(() => document.getElementById('btnPlanMode').click()); // back to owned mode
  await page.waitForTimeout(300);
  // owned path: raw item panel has "From owned → this"
  await page.evaluate(() => { window.__cy.getElementById('Ash Logs').emit('tap', {}); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.getElementById('btnPathOwned'); if (b) b.click(); });
  await page.waitForTimeout(400);
  const armed = await page.evaluate(() => ({ arming: document.body.classList.contains('path-arming-owned'), ph: document.getElementById('search').placeholder }));
  console.log('From owned arming:', JSON.stringify(armed));
  await page.evaluate(() => { window.__cy.getElementById('Iron Sword').emit('tap', {}); });
  await page.waitForTimeout(900);
  const pathState = await page.evaluate(() => {
    const label = [...document.querySelectorAll('#panelBody .p-label')].map(l => l.innerText.split('\n')[0]).find(t => t.includes('Path from'));
    const steps = [...document.querySelectorAll('#panelBody .path-step')].length;
    return { label, steps, traced: window.__cy.elements('.traced').length };
  });
  console.log('owned path result:', JSON.stringify(pathState));
  await page.screenshot({ path: 'cache/shots2/pf3-path.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // cleanup ledger + plan mode so other sections are unaffected
  await page.evaluate(() => {
    localStorage.removeItem('dw.owned');
    localStorage.removeItem('dw.planMode');
    localStorage.removeItem('dw.wpProgress');
  });
}
if (!only || only === 'pf') {
  await switchTo('cose-bilkent');
  await page.waitForTimeout(3500);
  // 1) "From nothing" plan in the Iron Sword panel
  await page.evaluate(() => { window.__cy.getElementById('Iron Sword').emit('tap', {}); });
  await page.waitForTimeout(900);
  const plan = await page.evaluate(() => {
    const body = document.getElementById('panelBody');
    const planEl = body.querySelector('.p-section.plan');
    if (!planEl) return null;
    const subs = [...planEl.querySelectorAll('.p-label.sub')].map(s => s.innerText.trim());
    const mats = [...planEl.querySelectorAll('.recipe-mats .mat .mn')].map(m => m.textContent);
    return { subs, mats: mats.slice(0, 10), hasPathBtn: !!document.getElementById('btnPathTo') };
  });
  console.log('plan Iron Sword:', JSON.stringify(plan));
  await page.screenshot({ path: 'cache/shots2/pf-plan.png' });
  // 2) two-node path: open Firefly Jar panel, hit "Path to…", tap Iron Sword
  await page.evaluate(() => { window.__cy.getElementById('Ash Logs').emit('tap', {}); });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('btnPathTo').click());
  await page.waitForTimeout(300);
  const arming = await page.evaluate(() => document.body.classList.contains('path-arming'));
  console.log('arming after Path-to click:', arming);
  await page.evaluate(() => { window.__cy.getElementById('Iron Sword').emit('tap', {}); });
  await page.waitForTimeout(900);
  const pathState = await page.evaluate(() => {
    const body = document.getElementById('panelBody');
    const steps = [...body.querySelectorAll('.path-step')].map(r => r.innerText.replace(/\s+/g, ' ').trim());
    const traced = window.__cy.elements('.traced').length;
    const faded = window.__cy.elements('.faded').length;
    return { steps, traced, faded, armingOff: !document.body.classList.contains('path-arming') };
  });
  console.log('path Ash Logs→Iron Sword:', JSON.stringify(pathState, null, 1));
  await page.screenshot({ path: 'cache/shots2/pf-path.png' });
  // 3) Esc clears everything
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const cleared = await page.evaluate(() => ({ traced: window.__cy.elements('.traced').length, arming: document.body.classList.contains('path-arming') }));
  console.log('after Esc:', JSON.stringify(cleared));
  // 4) Path-to via search box: arm from Copper Ore, pick Iron Sword through search
  await page.evaluate(() => { window.__cy.getElementById('Copper Ore').emit('tap', {}); });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('btnPathTo').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const si = document.getElementById('search');
    si.value = 'iron sw';
    si.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.sug-item').click());
  await page.waitForTimeout(700);
  const viaSearch = await page.evaluate(() => {
    const steps = [...document.querySelectorAll('#panelBody .path-step')].length;
    const ph = document.getElementById('search').placeholder;
    return { traced: window.__cy.elements('.traced').length, steps, placeholderReset: ph.includes('Search items') };
  });
  console.log('path Copper Ore→Iron Sword via search:', JSON.stringify(viaSearch));
  await page.screenshot({ path: 'cache/shots2/pf-path-search.png' });
  // 5) Esc in search box cancels arming
  await page.evaluate(() => { document.getElementById('btnPathTo') && document.getElementById('btnClearPath') && document.getElementById('btnClearPath').click(); });
  await page.evaluate(() => { window.__cy.getElementById('Ash Logs').emit('tap', {}); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('btnPathTo') && document.getElementById('btnPathTo').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const si = document.getElementById('search');
    si.focus();
    si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await page.waitForTimeout(300);
  const escCancel = await page.evaluate(() => ({ arming: document.body.classList.contains('path-arming'), ph: document.getElementById('search').placeholder }));
  console.log('Esc cancels arming:', JSON.stringify(escCancel));
}
if (!only || only === 'help') {
  await page.waitForTimeout(1000);
  // open via button
  await page.evaluate(() => document.getElementById('helpBtn').click());
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => !document.getElementById('helpModal').hidden);
  console.log('help opens via button:', opened);
  await page.screenshot({ path: 'cache/shots2/help-modal.png' });
  // close via Esc
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const escClosed = await page.evaluate(() => document.getElementById('helpModal').hidden);
  console.log('Esc closes help:', escClosed);
  // open via ? key, close via backdrop
  await page.keyboard.press('?');
  await page.waitForTimeout(250);
  const keyOpened = await page.evaluate(() => !document.getElementById('helpModal').hidden);
  await page.mouse.click(30, 480); // backdrop area
  await page.waitForTimeout(250);
  const backdropClosed = await page.evaluate(() => document.getElementById('helpModal').hidden);
  console.log('? key opens:', keyOpened, '| backdrop click closes:', backdropClosed);
}
if (!only || only === 'force') {
  await switchTo('cose-bilkent');
  await page.waitForTimeout(3500);
  await page.evaluate(() => { document.getElementById('forceToggle').checked = false; document.getElementById('forceToggle').onchange(); });
  await page.waitForTimeout(4000);
  console.log('force-off bounds:', JSON.stringify(await bounds()));
  const meta = await page.evaluate(() => document.getElementById('layoutMeta').innerText.replace(/\n/g, ' | '));
  console.log('meta:', meta);
  await page.evaluate(() => { document.getElementById('forceToggle').checked = true; document.getElementById('forceToggle').onchange(); });
}
if (!only || only === 'battery' || only === 'all-layouts') {
  const results = [];
  const filter = (process.env.LAYOUTS || '').split(',').map(s => s.trim()).filter(Boolean);
  let names = await page.evaluate(() => [...document.querySelectorAll('#layoutSelect option')].map(o => o.value));
  if (filter.length) names = names.filter(n => filter.includes(n));
  console.log(`layouts in dropdown: ${names.length}`);
  let sinceReload = 0;
  for (const name of names) {
    try {
      if (sinceReload >= 4) { // fresh page every 4 layouts — long sessions wedge this box
        await page.reload({ waitUntil: 'commit' });
        await page.waitForFunction(() => window.__cy && window.__cy.nodes().length > 0, null, { timeout: 90000, polling: 500 });
        await page.waitForTimeout(1500);
        sinceReload = 0;
      }
      sinceReload++;
      await switchTo(name);
      await page.waitForTimeout(600);
      const done = await page.evaluate(() => new Promise(res => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (!document.getElementById('layoutInd').classList.contains('on')) { clearInterval(iv); res(true); }
          else if (Date.now() - t0 > 90000) { clearInterval(iv); res(false); } // spread/avsdf take 40-70s
        }, 200);
      }));
      const b2 = await bounds();
      results.push({ name, done, ...b2 });
      console.log(`  ${name.padEnd(20)} ${done ? 'ok' : 'TIMEOUT'} bounds=${b2.w}x${b2.h}${b2.bad ? ' NaN=' + b2.bad : ''}`);
    } catch (e) {
      results.push({ name, done: false, error: e.message.split('\n')[0] });
      console.log(`  ${name.padEnd(20)} ERROR ${e.message.split('\n')[0]}`);
    }
  }
  const bad = results.filter(r => !r.done || r.bad || r.error);
  console.log(`battery: ${results.length - bad.length}/${results.length} layouts clean`);
}
if (!only || only === 'p0' || only === 'p0depth') {
  if (only !== 'p0depth') {
  await switchTo('cose-bilkent');
  await page.waitForTimeout(3500);
  // P0-1: mid-flight switch — start cola, then switch to dagre 400ms in
  await switchTo('cola');
  await page.waitForTimeout(400);
  const midInd = await page.evaluate(() => document.getElementById('layoutIndText').textContent);
  await switchTo('dagre');
  await page.waitForTimeout(500);
  const newInd = await page.evaluate(() => document.getElementById('layoutIndText').textContent);
  await page.waitForTimeout(2500);
  const settled = await page.evaluate(() => !document.getElementById('layoutInd').classList.contains('on'));
  const bb = await bounds();
  console.log('P0-1 mid-switch:', JSON.stringify({ midInd, newInd, settled, bounds: bb }));
  console.log('  expect: newInd starts with "Arranging · dagre", settled true, bad=0');
  }
  // P0-2: depth-limited isolate on Iron Bar
  await switchTo('cose-bilkent');
  await page.waitForTimeout(3500);
  const depthCounts = {};
  for (const val of ['1', '3', '']) {
    await page.evaluate(() => { window.__cy.getElementById('Iron Bar').emit('tap'); }); // open panel first
    await page.waitForTimeout(400);
    await page.evaluate(v => {
      document.getElementById('isoDepth').value = v;
      document.getElementById('btnIsolate').click();
    }, val);
    await page.waitForTimeout(1200);
    depthCounts[val === '' ? 'all' : 'depth' + val] = await page.evaluate(() => window.__cy.nodes(':visible').length);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  console.log('P0-2 depth counts:', JSON.stringify(depthCounts));
  console.log('  expect: depth1 < depth3 < all(1408), all equals previous full-tree count');
  await page.screenshot({ path: 'cache/shots2/p0-depth.png' });
}
if (!only || only === 'p18') {
  // P3-1 + TODO #18 verification: calm first load + dedicated Path-to bar.
  // A fresh playwright profile means fresh localStorage — this IS first load.
  const firstLoad = await page.evaluate(() => ({
    stored: localStorage.getItem('dw.showSkillEdges'),
    chipOn: document.getElementById('edgeSkillChip').classList.contains('on'),
    total: window.__cy.edges().length,
    visible: window.__cy.edges(':visible').length,
  }));
  console.log('first load:', JSON.stringify(firstLoad));
  console.log('  expect: stored null, chip off, visible < total (skill gates hidden)');

  // dedicated Path-to bar: arming state visible at top of map
  await page.evaluate(() => { window.__cy.getElementById('Ash Logs').emit('tap', {}); });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('btnPathTo').click());
  await page.waitForTimeout(300);
  const armed = await page.evaluate(() => {
    const pb = document.getElementById('pathbar');
    return { shown: pb && !pb.classList.contains('hidden'), text: document.getElementById('pathbarText').textContent, arming: document.body.classList.contains('path-arming') };
  });
  console.log('pathbar armed:', JSON.stringify(armed));
  await page.screenshot({ path: 'cache/shots2/p18-armed.png' });

  // resolve: tap target → calm summary stays visible
  await page.evaluate(() => { window.__cy.getElementById('Iron Sword').emit('tap', {}); });
  await page.waitForTimeout(900);
  const resolved = await page.evaluate(() => ({
    text: document.getElementById('pathbarText').textContent,
    result: document.body.classList.contains('path-result'),
    armingOff: !document.body.classList.contains('path-arming'),
    traced: window.__cy.elements('.traced').length,
  }));
  console.log('pathbar resolved:', JSON.stringify(resolved));
  await page.screenshot({ path: 'cache/shots2/p18-resolved.png' });

  // Esc clears the bar entirely
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => ({ hidden: document.getElementById('pathbar').classList.contains('hidden'), traced: window.__cy.elements('.traced').length }));
  console.log('pathbar after Esc:', JSON.stringify(cleared));

  // ✕ cancel button also clears while armed
  await page.evaluate(() => { window.__cy.getElementById('Ash Logs').emit('tap', {}); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('btnPathTo').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('pathbarCancel').click());
  await page.waitForTimeout(300);
  const cancelled = await page.evaluate(() => document.getElementById('pathbar').classList.contains('hidden'));
  console.log('pathbar cancel button clears:', cancelled);

  // skill chip still reveals the hidden gates (and persists)
  await page.evaluate(() => document.getElementById('edgeSkillChip').click());
  await page.waitForTimeout(400);
  const revealed = await page.evaluate(() => ({ visible: window.__cy.edges(':visible').length, stored: localStorage.getItem('dw.showSkillEdges') }));
  console.log('skill chip reveals:', JSON.stringify(revealed), `(expect visible === ${firstLoad.total}, stored "1")`);
  await page.evaluate(() => document.getElementById('edgeSkillChip').click()); // restore calm default
}
if (!only || only === 'p12') {
  // P1-2 worker spike: background layout thread. Verifies worker capabilities,
  // worker == main-thread fidelity, and the app's worker path end-to-end.
  const caps = await page.evaluate(async () => {
    const w = new Worker('layout-worker.js');
    const algos = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('ping timeout')), 60000);
      w.onmessage = e => { if (e.data && e.data.type === 'capabilities') { clearTimeout(to); resolve(e.data.algos); } };
      w.onerror = e => { clearTimeout(to); reject(new Error('worker error: ' + (e.message || 'x'))); };
      w.postMessage({ type: 'ping' });
    });
    w.terminate();
    return algos;
  });
  console.log('worker capabilities:', caps.length, 'of 18 ·', caps.includes('d3-force') ? 'd3-force ok' : 'd3-force MISSING');
  if (caps.length !== 18) throw new Error('FAIL: expected all 18 layouts runnable in worker');

  // worker == main fidelity on identical input (app preset elk-layered-wide @ 100%)
  const fid = await page.evaluate(async () => {
    const opts = { name: 'elk', animate: false, padding: 30, elk: { algorithm: 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.layered.spacing.nodeNodeBetweenLayers': 130, 'elk.spacing.nodeNode': 54 } };
    const mk = () => {
      const d = window.DW_DATA;
      const ids = new Set(d.nodes.map(n => n.id));
      const sk = new Set((d.skills || []).map(s => s.name));
      return {
        nodes: d.nodes.map(n => ({ data: { id: n.id, kind: n.kind } })),
        edges: d.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map((e, i) => ({ data: { id: 'e' + i, source: e.from, target: e.to, interaction: sk.has(e.from) ? 'skill-gate' : 'craft' } })),
      };
    };
    const g = mk();
    const main = await new Promise(resolve => {
      const cy = cytoscape({ headless: true, elements: { nodes: g.nodes, edges: g.edges } });
      cy.layout({ ...opts, fit: false, stop: () => {
        const out = {};
        cy.nodes().forEach(n => { out[n.id()] = { x: Math.round(n.position().x), y: Math.round(n.position().y) }; });
        cy.destroy();
        resolve(out);
      } }).run();
    });
    const wk = await new Promise((resolve, reject) => {
      const w = new Worker('layout-worker.js');
      const to = setTimeout(() => reject(new Error('worker elk timeout')), 120000);
      w.onmessage = e => { if (e.data && e.data.type === 'done') { clearTimeout(to); resolve(e.data); } };
      w.postMessage({ type: 'layout', jobId: 77, preset: 'elk-layered-wide', opts, nodes: g.nodes, edges: g.edges });
    });
    let maxD = 0;
    for (const [id, p] of Object.entries(wk.positions)) {
      const m = main[id];
      const d = m ? Math.hypot(p.x - m.x, p.y - m.y) : Infinity;
      if (d > maxD) maxD = d;
    }
    return { maxD, n: Object.keys(wk.positions).length };
  });
  console.log(`fidelity worker vs main: maxΔ=${fid.maxD} (${fid.n} nodes)`);
  if (fid.maxD > 0.5) throw new Error('FAIL: worker positions diverge from main thread');

  // app path: flip the toggle, run a live layout, expect worker marker + settled map.
  // savedToggle is flipped WITHOUT dispatching change — its handler re-runs the
  // current layout, which would queue a second (wasted) job in the single-threaded
  // worker ahead of the one we're waiting on.
  await page.evaluate(() => {
    localStorage.setItem('dw.animate', '0');
    document.getElementById('workerToggle').checked = true;
    document.getElementById('workerToggle').onchange({ target: { checked: true } });
    document.getElementById('savedToggle').checked = false;
  });
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'dagre';
    sel.onchange({ target: { value: 'dagre' } });
  });
  // slow boxes (prod) can take 90s+: the worker is single-threaded and any job
  // queued before ours still runs to completion before ours starts
  await page.waitForFunction(() => !document.getElementById('layoutInd').classList.contains('on'), null, { timeout: 180000, polling: 300 });
  const appPath = await page.evaluate(() => {
    const c = window.__cy;
    const bb = c.nodes(':visible').boundingBox({});
    return { w: Math.round(bb.w), h: Math.round(bb.h), bad: c.nodes(':visible').filter(n => !isFinite(n.position().x)).length };
  });
  console.log('app worker path (dagre):', JSON.stringify(appPath));
  if (appPath.bad > 0 || appPath.w < 300) throw new Error('FAIL: worker app path produced a degenerate map');

  // toggle off restores main-thread runs
  await page.evaluate(() => {
    document.getElementById('workerToggle').checked = false;
    document.getElementById('workerToggle').onchange({ target: { checked: false } });
    localStorage.setItem('dw.animate', '1');
    document.getElementById('savedToggle').checked = true;
  });
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'elk-layered-wide';
    sel.onchange({ target: { value: 'elk-layered-wide' } });
  });
  await page.waitForFunction(() => !document.getElementById('layoutInd').classList.contains('on'), null, { timeout: 180000, polling: 300 });
  console.log('p12 worker spike: OK');
  await page.screenshot({ path: 'cache/shots2/p12-worker.png' });
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await cleanup();
srv?.close();
process.exit(0);
} catch (e) {
  console.error('PROBE FAIL:', e.message.split('\n')[0]);
  await cleanup();
  srv?.close();
  process.exit(1);
}
