// Smoke test for the Crafting Atlas site: loads the page, checks for errors,
// exercises search / select / isolate / filters, captures screenshots.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:8477';
const shots = 'cache/shots';
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3500); // layout animation

// 1. veil gone, nodes rendered?
const veilHidden = await page.$eval('#veil', el => el.classList.contains('hidden'));
const nodeCount = await page.evaluate(() => window.DW_DATA.nodes.length);
const cyNodes = await page.evaluate(() => window.__cy.nodes().length);
console.log('veil hidden:', veilHidden, '| dataset nodes:', nodeCount, '| cy nodes:', cyNodes);
await page.screenshot({ path: shots + '/01-initial.png' });

// 2. search + suggestions + select
await page.fill('#search', 'Iron Bar');
await page.waitForTimeout(400);
const sugCount = await page.$$eval('.sug-item', els => els.length);
console.log('suggestions for "Iron Bar":', sugCount);
await page.screenshot({ path: shots + '/02-search.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
const panelOpen = await page.$eval('#panel', el => el.classList.contains('open'));
const panelTitle = await page.$eval('#panelTitle', el => el.textContent);
console.log('panel open:', panelOpen, '| title:', panelTitle);
await page.screenshot({ path: shots + '/03-panel-ironbar.png' });

// 3. panel content sanity for a crafted item with recipe
const bodyText = await page.$eval('#panelBody', el => el.innerText);
console.log('panel mentions Furnace:', /Furnace/i.test(bodyText), '| mentions Iron Ore:', /Iron Ore/.test(bodyText));

// 4. trace inputs
const traceBtn = await page.$('#btnTrace');
if (traceBtn) { await traceBtn.click(); await page.waitForTimeout(500); }
await page.screenshot({ path: shots + '/04-trace.png' });

// 5. isolate tree (shift-click simulation via button)
const isoBtn = await page.$('#btnIsolate');
if (isoBtn) { await isoBtn.click(); await page.waitForTimeout(900); }
const bcVisible = await page.$eval('#breadcrumb', el => !el.classList.contains('hidden'));
console.log('breadcrumb visible after isolate:', bcVisible);
await page.screenshot({ path: shots + '/05-isolate.png' });

// 6. clear isolation via Escape, then click a station node directly
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.fill('#search', 'Furnace');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await page.screenshot({ path: shots + '/06-furnace.png' });

// 7. toggle a filter off (the legend is the filter surface; header chips are retired)
await page.evaluate(() => {
  const row = [...document.querySelectorAll('#legend .lg-row')].find(r => r.querySelector('span:last-child')?.textContent === 'Food');
  row.click();
});
await page.waitForTimeout(400);
const visibleAfterFilter = await page.evaluate(() => window.__cy.nodes(':visible').length);
console.log('visible nodes after hiding food:', visibleAfterFilter);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('#legend .lg-row')].find(r => r.querySelector('span:last-child')?.textContent === 'Food');
  row.click(); // restore
});
await page.waitForTimeout(300);

// 8. spells/skills in panel
await page.fill('#search', 'Superheat');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
const superheatText = await page.$eval('#panelBody', el => el.innerText);
console.log('Superheat shows Artisan lvl 20:', /Artisan/.test(superheatText) && /20/.test(superheatText));
await page.screenshot({ path: shots + '/07-spell.png' });

console.log('---');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
await browser.close();
