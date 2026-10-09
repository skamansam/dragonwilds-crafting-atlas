/* ═══════════════════════════════════════════════════════════════
   Layout worker client (Phase 2c).

   The main-thread half of the P1-2 worker spike, extracted from app.js:
   the `worker layout` toggle and its persistence, the lazily-built Worker
   (public/layout-worker.js — headless cytoscape with every vendor extension
   loaded, returning { id → {x,y} }), the capability probe, and the
   supersede-safe job dispatch. The worker itself is served verbatim from
   public/, so this module only ever talks to it over postMessage.

   Two tokens coordinate it with a run on the main thread:
     · workerRunSeq — bumped at the start of every runLayout; a stale worker
       result whose token no longer matches is dropped.
     · workerActiveJobId — the most recent in-flight job, which a superseding
       run CANCELS (the worker is single-threaded, so stale jobs would
       otherwise queue ahead of the live one).

   app.js hands over the things the module can't own itself: cy (to snapshot
   positions), LAYOUTS (for the preset→algorithm-name probe lookup), the
   toast, the option helpers, and the callback that clears a stale
   activeLayout when the toggle is switched off.
   ═══════════════════════════════════════════════════════════════ */

let cy = null;
let LAYOUTS = {};
let notify = () => {};
let persistOpt = () => {};
let syncAddress = () => {};
let readUrlBool = (name, stored) => stored;
let onDisabled = () => {};

let layoutWorker = null;
let workerJobId = 0;
let workerRunSeq = 0;          // runLayout-generation token — stale worker results are dropped
const workerJobs = new Map();  // jobId → resolve, for in-flight (supersede-safe) jobs
let workerCaps = null;
let workerActiveJobId = null;  // most recent in-flight worker job (cancel target)
let workerToggleEl = null;

export function initLayoutWorker({
  cy: graph, LAYOUTS: layouts, toast, storeOpt, syncUrl, urlBool, onWorkerOff,
} = {}) {
  cy = graph;
  if (layouts) LAYOUTS = layouts;
  if (toast) notify = toast;
  if (storeOpt) persistOpt = storeOpt;
  if (syncUrl) syncAddress = syncUrl;
  if (urlBool) readUrlBool = urlBool;
  if (onWorkerOff) onDisabled = onWorkerOff;

  workerToggleEl = document.getElementById('workerToggle');
  if (!workerToggleEl) return;
  // default ON since the P1-2 spike graduated (2026-09-24): the probe verified
  // 18/18 capability + bit-for-bit fidelity, and jank measurements showed
  // worst-frame 83→33ms. Workers that can't spin up (file://, ancient browsers)
  // fall back transparently.
  workerToggleEl.checked = readUrlBool('worker', localStorage.getItem('dw.worker') !== '0');
  workerToggleEl.onchange = () => {
    persistOpt('worker', workerToggleEl.checked ? '1' : '0');
    syncAddress();
    notify(workerToggleEl.checked
      ? 'Worker layout on — heavy layouts compute in a background thread'
      : 'Worker layout off — layouts run on the main thread again');
    if (!workerToggleEl.checked) onDisabled();
  };
  // pre-warm the worker (and its capability probe) when the toggle is on
  if (workerOn()) getLayoutWorker().postMessage({ type: 'ping' });
}

export function workerOn() {
  return !!(workerToggleEl && workerToggleEl.checked && typeof Worker !== 'undefined');
}

export function getLayoutWorker() {
  if (layoutWorker) return layoutWorker;
  try {
    layoutWorker = new Worker('layout-worker.js');
    layoutWorker.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'capabilities') { workerCaps = m.algos; return; }
      if (m.type === 'done') {
        const r = workerJobs.get(m.jobId);
        if (r) { workerJobs.delete(m.jobId); r(m); } // late results for superseded jobs land nowhere
      }
    };
    layoutWorker.onerror = e => {
      for (const [, r] of workerJobs) r({ type: 'error', message: e.message || 'worker error' });
      workerJobs.clear();
      try { layoutWorker.terminate(); } catch {}
      layoutWorker = null;
    };
  } catch { layoutWorker = null; }
  return layoutWorker;
}

export function workerSupports(preset) {
  if (workerCaps === null) return true; // probe not back yet — attempt anyway
  return workerCaps.includes(LAYOUTS[preset] ? LAYOUTS[preset]().name : preset);
}

// Supersede: bump the generation and cancel the in-flight job. Returns the new
// generation token, which the caller compares against workerRunToken() when the
// result lands (a mismatch means a newer run owns the canvas).
export function supersedeWorker() {
  ++workerRunSeq;
  if (workerActiveJobId !== null) {
    try { getLayoutWorker().postMessage({ type: 'cancel', jobId: workerActiveJobId }); } catch {}
    workerActiveJobId = null;
  }
  return workerRunSeq;
}

export function workerRunToken() { return workerRunSeq; }

export async function runWorkerLayout(preset, opts, timeoutMs = 120000, eles = null) {
  const w = getLayoutWorker();
  if (!w) return { type: 'error', message: 'worker unavailable' };
  const jobId = ++workerJobId;
  workerActiveJobId = jobId; // the job a future supersede should cancel
  // eles: optional visible-only subset (graph-change reflows) — hidden nodes
  // must not anchor the physics
  const nodes = (eles ? eles.nodes() : cy.nodes()).map(n => ({ data: { id: n.id() }, position: { x: n.position().x, y: n.position().y } }));
  const edges = (eles ? eles.edges() : cy.edges()).map(e => ({ data: { source: e.source().id(), target: e.target().id() } }));
  // functions (d3-force's linkId accessor) can't cross postMessage — strip them;
  // the worker re-injects the standard accessor for d3-force
  let safeOpts;
  try { safeOpts = JSON.parse(JSON.stringify(opts, (k, v) => typeof v === 'function' ? undefined : v)); }
  catch { safeOpts = { name: opts.name }; }
  return Promise.race([
    new Promise(resolve => {
      workerJobs.set(jobId, resolve);
      w.postMessage({ type: 'layout', jobId, preset, opts: safeOpts, nodes, edges });
    }),
    new Promise(resolve => setTimeout(() => {
      if (workerJobs.has(jobId)) { workerJobs.delete(jobId); resolve({ type: 'error', message: 'worker timed out' }); }
    }, timeoutMs)),
  ]);
}
