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
  await page.evaluate(() => { window.__cy.getElementById('Iron Bar').emit('tap', { originalEvent: { shiftKey: true } }); });
  await page.waitForTimeout(1500);
  const iso = await page.evaluate(() => {
    const c = window.__cy;
    return { visible: c.nodes(':visible').length, sword: c.getElementById('Iron Sword').visible() };
  });
  console.log('isolate Iron Bar:', JSON.stringify(iso));
  await page.screenshot({ path: 'cache/shots2/isolate-ironbar.png' });
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
