/* ═══════════════════════════════════════════════════════════════
   Post-update cleanup of the local data edits (P6-7).

   A saved correction can quietly go stale once the dataset moves: the atlas may
   now ship exactly the value you typed (your copy is a duplicate), or it may
   have changed that same field to something else (your copy silently wins over
   newer data). Both are invisible in the atlas, so after an update the app asks
   about them — first the duplicates, then the ones overriding an update — and
   drops only what the visitor agrees to.

   The overlay itself lives in src/edits.js; this module owns the dialog. The
   shipped data files are never touched either way.
   ═══════════════════════════════════════════════════════════════ */
import {
  cleanupAskedFor,
  editsCleanup,
  markCleanupAsked,
  removeEdits,
} from './edits.js';
import { esc } from './util.js';

const el = (id) => document.getElementById(id);

// the open dialog's dismiss, so app.js's Escape chain can close it like the
// help and edits windows (see the keydown handler there)
let dismissCurrent = null;
export function dismissCleanup() { if (dismissCurrent) dismissCurrent(); }

/* Ask, if the dataset has moved since the last answer and there is something to
   ask about. Steps run in order: the now-identical edits, then the ones that
   override an updated row. Returns true when the dialog was opened. */
export function maybeAskToCleanupEdits({ nameOf = (id) => id, datasetAt = null } = {}) {
  const dialog = el('cleanupModal');
  if (!dialog) return false;
  if (datasetAt && cleanupAskedFor() === datasetAt) return false;

  const { merged, moved } = editsCleanup();
  const steps = [];
  if (merged.length) steps.push({ kind: 'merged', ids: merged });
  if (moved.length) steps.push({ kind: 'moved', ids: moved });
  if (!steps.length) return false;

  let index = 0;
  const removed = [];

  const close = () => { dialog.hidden = true; dismissCurrent = null; };

  const render = () => {
    const step = steps[index];
    const n = step.ids.length;
    const plural = n > 1 ? 's' : '';
    const isMerged = step.kind === 'merged';
    el('cleanupTitle').textContent = isMerged
      ? `${n} EDIT${plural.toUpperCase()} ARE IN THE DATASET NOW`
      : `${n} EDIT${plural.toUpperCase()} OVERRIDE UPDATED DATA`;
    el('cleanupText').innerHTML = isMerged
      ? `The atlas now ships the value${plural} you saved, so your local cop${n > 1 ? 'ies are' : 'y is'} a duplicate — it no longer changes anything. Remove ${n > 1 ? 'them' : 'it'} from this browser?`
      : `The dataset has changed ${n > 1 ? 'these rows' : 'this row'} since you edited ${n > 1 ? 'them' : 'it'}, so your saved value${plural} still override${n > 1 ? '' : 's'} fresher data. Keep them and the atlas shows your version; remove them and it shows the updated dataset.`;
    el('cleanupList').innerHTML = step.ids.map(id =>
      `<div class="edit-diff"><span class="ed-field">${isMerged ? 'duplicate' : 'overrides'}</span><span class="ed-to">${esc(nameOf(id))}</span></div>`).join('');
    const yes = el('cleanupYes');
    yes.textContent = `Remove ${n} edit${plural}`;
    yes.classList.toggle('danger', !isMerged);
    el('cleanupNo').textContent = isMerged ? 'Keep them' : 'Keep my values';
    el('cleanupStep').textContent = steps.length > 1
      ? `Question ${index + 1} of ${steps.length} — the edits themselves are never sent anywhere.`
      : 'Nothing is sent anywhere — this only edits what your browser has saved.';
  };

  const finish = () => {
    markCleanupAsked(datasetAt);
    if (removed.length) location.reload(); // the overlay is re-read at boot
    else close();
  };

  const answer = (drop) => {
    const step = steps[index];
    if (drop) { removed.push(...step.ids); removeEdits(step.ids); }
    index++;
    if (index < steps.length) render();
    else finish();
  };

  const dismiss = () => { markCleanupAsked(datasetAt); close(); };
  dismissCurrent = dismiss;
  el('cleanupYes').onclick = () => answer(true);
  el('cleanupNo').onclick = () => answer(false);
  el('cleanupClose').onclick = dismiss;
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dismiss(); });

  render();
  dialog.hidden = false;
  return true;
}
