import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('console', m => console.log('[' + m.type() + ']', m.text().slice(0, 400)));
p.on('pageerror', e => console.log('[pageerror]', e.stack || e.message));
p.on('requestfailed', r => console.log('[reqfail]', r.url().slice(-60), r.failure()?.errorText));
await p.goto('http://localhost:8477', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(6000);
const state = await p.evaluate(() => ({
  dwdata: typeof window.DW_DATA,
  cyHook: typeof window.__cy,
  scripts: [...document.scripts].map(s => s.src.split('/').pop()),
  veilHidden: document.getElementById('veil')?.classList.contains('hidden'),
}));
console.log(JSON.stringify(state, null, 1));
await b.close();
