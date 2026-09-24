/* P1-2 spike: layout worker — runs cytoscape layouts off the main thread.
   Protocol (postMessage):
     in:  { type: 'ping' }
     out: { type: 'capabilities', algos: [...names that resolve] }
     in:  { type: 'layout', jobId, preset, opts, nodes, edges }
     out: { type: 'done',  jobId, preset, ms, positions: { id: {x, y} } }
     out: { type: 'error', jobId?, preset?, message }
   The app keeps ownership of preset option factories (LAYOUTS) and posts the
   built options object; this file stays generic. Mirrors the reference
   headless harness in scripts/gen-layouts.mjs: same extension load order as
   index.html (all extensions self-register against the cytoscape global via
   UMD — cytoscape.use() calls are not needed and would throw here), fit off,
   positions extracted at layoutstop.
*/
'use strict';

/* Cytoscape assumes a browser DOM; a Worker has neither window nor document.
   Minimal inert shims are enough for headless instantiation: the renderer
   touches `window` (d3/weaver feature-detect), `document.createElement` at
   extension-load time, and creates a detached <div> as a stand-in canvas
   parent when the app hands it one (it doesn't, here). */
if (typeof window === 'undefined') {
  const noopEl = () => ({
    style: {}, attributes: {}, children: [],
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    appendChild(child) { return child; }, removeChild(child) { return child; },
  });
  const docShim = { createElement: noopEl, createElementNS: noopEl, createTextNode: noopEl };
  self.window = self;
  self.document = docShim;
  // d3-quadtree/force probe these; false keeps them on the plain-JS path
  self.window.requestAnimationFrame = fn => setTimeout(fn, 16);
  self.window.cancelAnimationFrame = id => clearTimeout(id);
}

/* Extension load order must match index.html's script block exactly. The two
   cose-base generations are both needed (bilkent/cise captured v1, fcose
   needs v2); everything registers itself on the cytoscape global via UMD. */
importScripts(
  'vendor/cytoscape.min.js',
  'vendor/layout-base.js',
  'vendor/cose-base.js',
  'vendor/avsdf-base.js',
  'vendor/cytoscape-cose-bilkent.js',
  'vendor/cytoscape-cise.js',
  'vendor/layout-base2.js',
  'vendor/cose-base2.js',
  'vendor/cytoscape-fcose.js',
  'vendor/cytoscape-avsdf.js',
  'vendor/webcola.js',
  'vendor/cytoscape-cola.js',
  'vendor/cytoscape-euler.js',
  'vendor/weaverjs.js',
  'vendor/cytoscape-spread.js',
  'vendor/d3-quadtree.js',
  'vendor/d3-dispatch.js',
  'vendor/d3-timer.js',
  'vendor/d3-force.js'
);
/* cytoscape-d3-force reads the d3 namespace under the key 'd3-force' AT
   REGISTRATION TIME — the shim must exist before it loads (index.html does
   the same between the two script tags) */
self['d3-force'] = self.d3;
importScripts(
  'vendor/cytoscape-d3-force.js',
  'vendor/klay.js',
  'vendor/cytoscape-klay.js',
  'vendor/cytoscape-tidytree.js',
  'vendor/elk.bundled.js',
  'vendor/cytoscape-elk.js',
  'vendor/dagre.min.js',
  'vendor/cytoscape-dagre.js'
);

const activeJobs = new Map(); // jobId → cy.layout handle, for cancellation
function runLayoutJob(msg) {
  let { jobId, preset, opts, nodes, edges } = msg;
  const t0 = performance.now();
  // the app strips functions before postMessage (they can't be cloned);
  // d3-force resolves link source/target through an id accessor function —
  // re-inject the standard one when it was stripped
  if (opts && opts.name === 'd3-force' && !opts.linkId) opts = { ...opts, linkId: n => n.id };
  let cy;
  try {
    cy = cytoscape({ headless: true, elements: { nodes, edges } });
  } catch (e) {
    self.postMessage({ type: 'error', jobId, preset, message: 'cytoscape init failed: ' + (e && e.message || e) });
    return;
  }
  const finish = positions => {
    const ms = Math.round(performance.now() - t0);
    self.postMessage({ type: 'done', jobId, preset, ms, positions });
    // d3-force can fire a second end() (extension end + d3's own 'end') a few
    // timer ticks after layoutstop — destroying immediately would make that
    // straggler throw inside the worker and kill it. Destroy late instead.
    setTimeout(() => { try { cy.destroy(); } catch {} }, 300);
  };
  try {
    const lay = cy.layout({ ...opts, fit: false, stop: () => {
      const out = {};
      cy.nodes().forEach(n => { out[n.id()] = { x: Math.round(n.position().x), y: Math.round(n.position().y) }; });
      activeJobs.delete(jobId);
      finish(out);
    } });
    activeJobs.set(jobId, lay);
    lay.run();
  } catch (e) {
    activeJobs.delete(jobId);
    try { cy.destroy(); } catch {}
    self.postMessage({ type: 'error', jobId, preset, message: String(e && e.message || e) });
  }
}

/* Which layouts actually run here? Registry introspection isn't a public API,
   so the honest probe is empirical: run each registered name on a tiny 3-node
   graph and record what finishes. Cached after the first ping. */
const PROBE_OPTS = {
  // FDLayout-family defaults animate 'during' — that needs the main-thread
  // animation machinery, so the worker path (and this probe) uses animate:false
  'cose-bilkent': { animate: false }, cise: {}, fcose: { animate: false },
  avsdf: { animate: false }, cola: {}, euler: {},
  spread: { animate: false, boundingBox: { x1: 0, y1: 0, w: 500, h: 500 } },
  // d3 ticks via d3-timer, which in a worker falls back to setTimeout(…,17):
  // the DEFAULT alphaDecay (0.0228) needs ~300 ticks ≈ 5s, so the probe uses
  // a firmer decay (an app-chosen knob — the app preset ships 0.03) and a
  // wider window; the probe answers "does it run here", not "at what speed".
  'd3-force': { alphaDecay: 0.05, linkId: n => n.id }, klay: { klay: {} },
  tidytree: { direction: 'TB' },
  elk: { elk: { algorithm: 'layered' } },
  dagre: {}, cose: { animate: false }, breadthfirst: {}, circle: {},
  concentric: {}, grid: {}, random: {},
};
let capCache = null;
async function capabilities() {
  if (capCache) return capCache;
  const algos = [];
  for (const [name, extra] of Object.entries(PROBE_OPTS)) {
    // some layouts settle asynchronously (d3-force ticks via d3-timer) — wait
    // for layoutstop instead of assuming run() is synchronous
    let cy = null;
    const ok = await new Promise(resolve => {
      const to = setTimeout(() => resolve(false), 5000);
      try {
        cy = cytoscape({
          headless: true,
          elements: [{ data: { id: 'a' } }, { data: { id: 'b' } }, { data: { id: 'c' } },
            { data: { id: 'ab', source: 'a', target: 'b' } }, { data: { id: 'bc', source: 'b', target: 'c' } }],
        });
        cy.one('layoutstop', () => { clearTimeout(to); resolve(true); });
        cy.layout({ name, fit: false, ...extra, stop: () => {} }).run();
      } catch { clearTimeout(to); resolve(false); }
    }).catch(() => false);
    try { if (cy) cy.destroy(); } catch {}
    if (ok) algos.push(name);
  }
  capCache = algos;
  return algos;
}

self.onmessage = async e => {
  const msg = e.data || {};
  if (msg.type === 'ping') self.postMessage({ type: 'capabilities', algos: await capabilities() });
  else if (msg.type === 'layout') runLayoutJob(msg);
  else if (msg.type === 'cancel') { // superseded job: stop computing, free the thread
    const lay = activeJobs.get(msg.jobId);
    if (lay) { try { lay.stop(); } catch {} activeJobs.delete(msg.jobId); }
  }
};
