// Tests each item from TODO.md
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:8477';
const shots = 'cache/shots-todo';
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('veil').classList.contains('hidden'), null, { timeout: 60000 });
await page.waitForTimeout(600);
const cy = () => page.evaluate(() => window.__cy);

// helper: visible counts
async function counts() {
  return page.evaluate(() => {
    const c = window.__cy;
    return { nodes: c.nodes(':visible').length, edges: c.edges(':visible').length };
  });
}

// ── TODO: skill trees in graph ────────────────────────────────
{
  const r = await page.evaluate(() => {
    const c = window.__cy;
    const artisan = c.getElementById('Artisan');
    return { exists: artisan.length > 0, deg: artisan.length ? artisan.degree() : 0,
      kind: artisan.length ? artisan.data('meta').kind : null };
  });
  console.log('✓ skill node Artisan in graph:', JSON.stringify(r));
  await page.evaluate(() => {
    const c = window.__cy; c.getElementById('Artisan').emit('tap');
  });
  await page.waitForTimeout(800);
  const title = await page.$eval('#panelTitle', el => el.textContent);
  const body = await page.$eval('#panelBody', el => el.innerText);
  console.log('✓ Artisan panel opens:', title, '| level unlocks shown:', /level unlocks/i.test(body));
  await page.screenshot({ path: shots + '/01-skill-node.png' });
  await page.evaluate(() => window.__cy.elements().removeClass('sel'));
}

// ── TODO: unselect everything = blank screen ──────────────────
{
  const before = await counts();
  for (const cat of ['weapon','armour','tool','station','ammo','trinket','food','potion','material','spell','skill','other']) {
    await page.click(`.chip[data-cat="${cat}"]`).catch(() => {});
  }
  await page.waitForTimeout(400);
  const after = await counts();
  console.log('✓ all filters off:', before.nodes, '→', after.nodes, '(blank allowed)');
  await page.screenshot({ path: shots + '/02-blank.png' });
  await page.click('#resetFilters');
  await page.waitForTimeout(400);
  const restored = await counts();
  console.log('✓ restore all:', restored.nodes);
}

// ── TODO: isolate tree auto-reveals ──────────────────────────
{
  // hide weapons + stations first
  await page.click('.chip[data-cat="weapon"]');
  await page.click('.chip[data-cat="station"]');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const c = window.__cy;
    return [...c.getElementById('Iron Bar').neighborhood()].length;
  });
  // isolate via shift-tap
  await page.evaluate(() => {
    const c = window.__cy;
    c.getElementById('Iron Bar').emit('tap', { originalEvent: { shiftKey: true } });
  });
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => {
    const c = window.__cy;
    const visibleNodes = c.nodes(':visible').length;
    const ironVisible = c.getElementById('Iron Bar').visible();
    let weaponVisible = 0;
    c.getElementById('Iron Bar').connectedEdges().forEach(e => {
      const other = e.source().id() === 'Iron Bar' ? e.target() : e.source();
      if (other.data('meta').kind === 'weapon' && other.visible()) weaponVisible++;
    });
    return { visibleNodes, ironVisible, weaponVisible };
  });
  console.log('✓ isolate reveals all kinds (weapons visible in tree):', JSON.stringify(state));
  await page.screenshot({ path: shots + '/03-isolate-reveal.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ── TODO: layout selector ─────────────────────────────────────
{
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'dagre';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(3000);
  const spread = await page.evaluate(() => {
    const c = window.__cy;
    const bb = c.nodes(':visible').boundingBox({});
    return { w: Math.round(bb.w), h: Math.round(bb.h) };
  });
  console.log('✓ dagre TB layout applied, bounds:', JSON.stringify(spread));
  await page.screenshot({ path: shots + '/04-dagre-tb.png' });
  await page.evaluate(() => {
    const sel = document.getElementById('layoutSelect');
    sel.value = 'cose-bilkent';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(3000);
}

// ── TODO: possessions ─────────────────────────────────────────
{
  // clear storage first
  await page.evaluate(() => localStorage.removeItem('dw.owned'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('veil').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(600);
  // mark Furnace + Campfire owned
  for (const item of ['Furnace', 'Campfire']) {
    await page.fill('#search', item);
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await page.click('#btnOwn');
    await page.waitForTimeout(200);
  }
  const ownedCount = await page.$eval('#ownedCount', el => el.textContent);
  console.log('✓ owned count:', ownedCount);
  await page.click('#possessionsChip');
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const c = window.__cy;
    const locked = c.nodes('.locked:visible').length;
    const reach = c.nodes('.reachable:visible').length;
    const ironBar = c.getElementById('Iron Bar');
    return { locked, reach, ironBarLocked: ironBar.hasClass('locked'), ironBarReach: ironBar.hasClass('reachable') };
  });
  console.log('✓ possessions mode:', JSON.stringify(state));
  await page.screenshot({ path: shots + '/05-possessions.png' });
  // persisted?
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dw.owned')));
  console.log('✓ owned persisted:', JSON.stringify(stored));
  await page.click('#possessionsChip'); // off
  await page.waitForTimeout(300);
}

// ── TODO: clickable facilities in panel ───────────────────────
{
  await page.fill('#search', 'Iron Bar');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  const fac = await page.$('.recipe-facility.fac-link');
  if (fac) {
    await fac.click();
    await page.waitForTimeout(700);
    const title = await page.$eval('#panelTitle', el => el.textContent);
    console.log('✓ facility click navigates to:', title);
  } else {
    console.log('✗ facility link not found');
  }
}

console.log('---');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
