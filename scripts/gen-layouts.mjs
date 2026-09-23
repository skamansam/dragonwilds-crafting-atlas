// Generates precomputed layout positions (P1.5-3, TODO #17): runs each
// algorithm headlessly against the full graph, then writes
//   site/layouts/manifest.js  →  window.DW_LAYOUTS = { <algo>: { <nodeId>: {x, y} } }
// runLayout() applies these instantly when "saved positions" is checked —
// no physics, no wait, deterministic. Cytoscape-Desktop-authored positions
// can be dropped into the same manifest (same node-id keys).
//
// Usage: node scripts/gen-layouts.mjs [algo ...]   (default: the bundled set)
// Headless layouts (elk) need no animation; animated presets run with
// animate:false for speed. Results are merged, never clobbered, per algo.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'site/layouts');
fs.mkdirSync(OUT_DIR, { recursive: true });

// dataset (window.DW_DATA)
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'site/data.js'), 'utf8'), ctx);
const D = ctx.window.DW_DATA;

// preset definitions — imported from the app by evaluating a trimmed slice:
// simpler to re-declare the two layouts we precompute here than to extract.
const FORCE = false; // "spread out" variant reads better as a default snapshot
const PRESETS = {
  'elk-layered': {
    name: 'elk', animate: false, padding: 30,
    elk: {
      algorithm: 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': FORCE ? 60 : 110,
      'elk.spacing.nodeNode': FORCE ? 24 : 46,
    },
  },
  'cose-bilkent': {
    name: 'cose-bilkent', animate: false, randomize: true,
    nodeSeparation: FORCE ? 120 : 170, idealEdgeLength: FORCE ? 110 : 170, nodeRepulsion: FORCE ? 22000 : 42000,
    numIter: 2500,
  },
};

const only = process.argv.slice(2);
for (const k of Object.keys(PRESETS)) {
  if (only.length && !only.includes(k)) delete PRESETS[k];
}
if (!Object.keys(PRESETS).length) {
  console.error('nothing to generate — valid algos:', Object.keys(PRESETS).join(', ') || '(see script)');
  process.exit(1);
}

// existing manifest (merge, don't clobber)
const MANIFEST = path.join(OUT_DIR, 'manifest.js');
let manifest = {};
if (fs.existsSync(MANIFEST)) {
  const c2 = { window: {} };
  vm.createContext(c2);
  vm.runInContext(fs.readFileSync(MANIFEST, 'utf8'), c2);
  manifest = c2.window.DW_LAYOUTS || {};
}

// build element list once
const idSet = new Set(D.nodes.map(n => n.id));
const skillNames = new Set((D.skills || []).map(s => s.name));
const nodes = D.nodes.map(n => ({ data: { id: n.id, kind: n.kind } }));
const edges = [];
for (const e of D.edges) {
  if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
  edges.push({ data: { id: `e${edges.length}`, source: e.from, target: e.to, interaction: skillNames.has(e.from) ? 'skill-gate' : 'craft' } });
}

let launched = false;
const results = {};
try {
  const { chromium } = await import('playwright');
  launched = true;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<!DOCTYPE html><html><head>
    <script src="http://localhost:8477/vendor/cytoscape.min.js"><\/script>
    <script src="http://localhost:8477/vendor/layout-base.js"><\/script>
    <script src="http://localhost:8477/vendor/cose-base.js"><\/script>
    <script src="http://localhost:8477/vendor/cytoscape-cose-bilkent.js"><\/script>
    <script src="http://localhost:8477/vendor/elk.bundled.js"><\/script>
    <script src="http://localhost:8477/vendor/cytoscape-elk.js"><\/script>
    </head><body></body></html>`);
  await page.waitForFunction(() => window.cytoscape && window.cytoscape.use, null, { timeout: 20000 });

  for (const [algo, preset] of Object.entries(PRESETS)) {
    const t0 = Date.now();
    const pos = await page.evaluate(([algo, preset, nodes, edges]) => {
      const cy = cytoscape({ headless: true, elements: { nodes, edges } });
      return new Promise(resolve => {
        const opts = { ...preset, fit: false, stop: () => {
          const out = {};
          cy.nodes().forEach(n => { out[n.id()] = { x: Math.round(n.position().x), y: Math.round(n.position().y) }; });
          cy.destroy();
          resolve(out);
        } };
        try { cy.layout(opts).run(); } catch (e) { resolve({ __error: String(e && e.message || e) }); }
      });
    }, [algo, preset, nodes, edges]);
    if (pos.__error) {
      console.error(`${algo}: FAILED — ${pos.__error}`);
      continue;
    }
    results[algo] = pos;
    manifest[algo] = pos;
    console.log(`${algo}: ${Object.keys(pos).length} nodes in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await browser.close();
} catch (e) {
  if (!launched) console.error('playwright unavailable —', e.message.split('\n')[0]);
  else throw e;
}

if (Object.keys(results).length) {
  const body = `// Precomputed layout positions (generated by scripts/gen-layouts.mjs —\n// do not edit by hand; Desktop-authored snapshots may be added with the\n// same shape: { "<algo>": { "<nodeId>": { x, y } } }).\n// Applied instantly by runLayout() when "saved positions" is checked.\nwindow.DW_LAYOUTS = ${JSON.stringify(manifest)};\n`;
  fs.writeFileSync(MANIFEST, body);
  console.log(`manifest.js: ${Object.keys(manifest).length} algos, ${(fs.statSync(MANIFEST).size / 1048576).toFixed(1)} MB`);
} else {
  console.log('no new layouts generated; manifest untouched');
}
