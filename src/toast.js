/* ═══════════════════════════════════════════════════════════════
   Toast + one-shot Undo (Phase 2c).

   The single transient message line, extracted from app.js. Every module that
   needs to say something to the visitor — the layout store, the worker client,
   the path query, the highlight walk, the panel — funnels through toast(), so
   owning it here means those modules import it instead of having app.js thread
   a callback through their init().

   The Undo affordance rides on top: toastWithUndo() arms a restore callback and
   the next upgradeToastWithUndo() (called by runLayout, so a "this re-runs the
   layout" flip gets its Undo only once the re-run has actually started) swaps
   the live toast's text for text + an Undo button. It is deliberately one-shot:
   only the most recent armed flip can be reversed.
   ═══════════════════════════════════════════════════════════════ */

let toastTimer = null;
let pendingSettingUndo = null;

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.dataset.msg = msg; // upgradeToastWithUndo rebuilds from this (textContent is wiped by the rebuild)
  t.classList.add('show');
  clearTimeout(toastTimer);
  // toasts that will gain an Undo button live longer — a click target that
  // disappears in 1.8s is not an affordance
  toastTimer = setTimeout(() => t.classList.remove('show'), pendingSettingUndo ? 5000 : 1800);
}

// One-shot Undo hook for settings flips (⚙ panel): arms a restore callback and
// lets the next upgradeToastWithUndo() attach the button. Lets "did I mean to do
// that?" flips — re-layout on graph change, Possessions focus — be reversed in
// one click.
export function toastWithUndo(msg, undo) {
  pendingSettingUndo = undo;
  toast(msg);
}

// swaps the live toast's text for text + an Undo button (the toast itself is
// pointer-events:none — only the button re-enables pointer events)
export function upgradeToastWithUndo() {
  const undo = pendingSettingUndo;
  if (!undo) return;
  pendingSettingUndo = null;
  setTimeout(() => {
    const t = document.getElementById('toast');
    if (!t || !t.classList.contains('show')) return; // already dismissed
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = t.dataset.msg || '';
    const btn = document.createElement('button');
    btn.className = 'toast-undo';
    btn.textContent = 'Undo';
    btn.onclick = () => { clearTimeout(toastTimer); t.classList.remove('show'); undo(); };
    t.append(span, btn);
  }, 0);
}
