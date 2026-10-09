/* ═══════════════════════════════════════════════════════════════
   Layout progress + timing (Phase 2c).

   Extracted from app.js: the "Arranging…" pill's progress bar and the header's
   "last layout: 11.8s · 1,414 nodes" readout. This is a presentational slice,
   so it borrows only two things from the app — whether a layout is currently in
   flight (to stop refreshing the readout mid-arrange) and how to refresh the
   readout itself. Everything else (the EMA of run times, the interval timers,
   the “…s ago” suffix, the DOM ids) is private here.

   The app calls markLayoutStart() when a run begins and recordLayoutDone() when
   it settles; the module owns the rest.
   ═══════════════════════════════════════════════════════════════ */
import { fmtLayoutDur } from './util.js';

// Deterministic layouts (elk/dagre/…) can't report progress, so the bar is
// time-calibrated: an exponential moving average of finished runs predicts the
// duration, the bar fills at the predicted pace and decelerates into the last
// 5% — a smooth lie that ends exactly when the layout does.
const PROGRESS_MS = {
  'elk-layered-wide': 11000, 'elk-layered': 10000, cise: 52000, spread: 32000,
  'd3-force': 18000, avsdf: 14000, euler: 11000, cola: 10000,
  'cose-bilkent': 4500, fcose: 4500, dagre: 6000, 'dagre-lr': 6000,
  tidytree: 4000, 'tidytree-lr': 4000, klay: 15000,
};
const runTimes = {}; // preset -> EMA of observed durations (ms)
let layoutT0 = 0;   // ⏱ start of the in-flight layout — feeds the last-layout readout
let progressTimer = null;
let progressT0 = 0;
let progressPredictedMs = 0;

// Every completed layout records its wall-clock duration and the node count it
// arranged; the header (next to the algorithm name) shows "last layout: 11.8s ·
// 1,414 nodes". Reused for the live elapsed counter in the Arranging pill.
let lastLayoutMs = 0;      // ms the last completed layout took (wall clock)
let lastLayoutNodes = 0;   // node count it arranged
let lastLayoutAt = 0;      // epoch ms when it finished (for a "· 4s ago" suffix)
let layoutPillTimer = null; // live elapsed ticker inside the Arranging pill

// wired by initLayoutProgress — lets the app own the "is a layout running?"
// flag and the readout refresh without the module reaching into app state
let isLayoutRunning = () => false;
let refreshReadout = () => {};
let started = false;

export function initLayoutProgress({ isRunning, updateReadout } = {}) {
  if (isRunning) isLayoutRunning = isRunning;
  if (updateReadout) refreshReadout = updateReadout;
  if (started) return; // the 5s ticker is a singleton
  started = true;
  // refresh the "…s ago" suffix without re-rendering everything else
  setInterval(() => {
    if (lastLayoutAt && !isLayoutRunning() && document.getElementById('lastLayout')) setLayoutMetaDuration();
  }, 5000);
}

// ⏱ the in-flight layout's start — runLayout calls this the moment it begins
export function markLayoutStart() { layoutT0 = performance.now(); }
// wall-clock ms since the current run started (used for the completion record)
export function layoutElapsed() { return performance.now() - layoutT0; }
// the header readout renders from this
export function lastLayout() { return { ms: lastLayoutMs, nodes: lastLayoutNodes }; }

export function setProgress(pct) {
  const fill = document.getElementById('layoutIndBarFill');
  if (!fill) return;
  // scaleX instead of width — animating width thrashes layout; transform doesn't
  fill.style.transform = `scaleX(${(Math.min(100, Math.max(0, pct)) / 100).toFixed(4)})`;
}
export function startProgressBar(preset) {
  const bar = document.getElementById('layoutIndBar');
  if (!bar) return;
  const observed = runTimes[preset];
  progressPredictedMs = observed || PROGRESS_MS[preset] || 12000;
  progressT0 = performance.now();
  bar.classList.add('on');
  setProgress(2);
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    const el = performance.now() - progressT0;
    const lin = el / progressPredictedMs;                       // linear pace
    const pct = lin < 0.95 ? 2 + lin * 93 : 95 + Math.min(4, (lin - 0.95) * 4); // decelerate into the last 5%
    setProgress(pct);
  }, 120);
}
export function stopProgressBar(preset, finished) {
  clearInterval(progressTimer);
  progressTimer = null;
  const bar = document.getElementById('layoutIndBar');
  if (bar) bar.classList.remove('on');
  setProgress(0);
  if (preset && finished) { // first run seeds the table, later runs smooth via EMA
    const ms = performance.now() - progressT0;
    if (ms > 250 && ms < 120000) runTimes[preset] = runTimes[preset] ? runTimes[preset] * 0.6 + ms * 0.4 : ms;
  }
}

export function startLayoutPill() {
  // tick the Arranging pill so slow layouts show elapsed time as they run,
  // keeping the algorithm name: "Arranging · elk (worker) · 3.4s"
  const t0 = performance.now();
  stopLayoutPill();
  const el = document.getElementById('layoutIndText');
  const base = el && el.textContent ? el.textContent.replace(/…$/, '').trim() : 'Arranging';
  layoutPillTimer = setInterval(() => {
    if (!el) { stopLayoutPill(); return; }
    const ms = performance.now() - t0;
    if (ms > 120000) { stopLayoutPill(); return; } // safety net ran long ago — stop ticking
    el.textContent = `${base} · ${fmtLayoutDur(ms)}`;
  }, 250);
}
export function stopLayoutPill() {
  clearInterval(layoutPillTimer);
  layoutPillTimer = null;
}
export function recordLayoutDone(ms, nodeCount) {
  // superseded in-flight runs must not overwrite a real completion's timing
  if (ms > 0) { lastLayoutMs = ms; lastLayoutNodes = nodeCount; lastLayoutAt = Date.now(); }
  stopLayoutPill();
  refreshReadout();
}
function setLayoutMetaDuration() {
  // append/refresh the "last layout: 11.8s · 1,414 nodes · 4s ago" span
  const meta = document.getElementById('layoutMeta');
  if (!meta || lastLayoutMs <= 0) return;
  const ago = lastLayoutAt ? Math.round((Date.now() - lastLayoutAt) / 1000) : 0;
  const n = lastLayoutNodes > 0 ? ` · ${lastLayoutNodes.toLocaleString()} nodes` : '';
  let el = document.getElementById('lastLayout');
  if (!el) {
    el = document.createElement('span');
    el.id = 'lastLayout';
    meta.appendChild(el);
  }
  el.innerHTML = `last layout: <b>${fmtLayoutDur(lastLayoutMs)}</b>${n}` +
    (ago >= 2 ? ` · <span class="ago">${ago < 60 ? ago + 's ago' : Math.round(ago / 60) + 'm ago'}</span>` : '');
}
