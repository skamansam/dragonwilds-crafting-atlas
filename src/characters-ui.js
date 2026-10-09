/* ═══════════════════════════════════════════════════════════════
   CHARACTERS — per-character graph state & skill levels (TODO #24)
   Split out of src/app.js (Phase 2). src/characters.js owns the schema and
   the dw.* state swap; this module is only the UI: the ⚉ header control, the
   startup prompt for a first character, and the skill-level editor on a skill
   hub. Switching/creating a character swaps the live keys and reloads, so every
   part of the app re-reads them.
   The graph handle (cy) and toast() come from app.js via initCharactersUI().
   ═══════════════════════════════════════════════════════════════ */
import { esc } from './util.js';

const CH = window.DW_CHARACTERS;
let cy = null;
let toast = () => {};

// Reload into the state a character swap just applied. Graph options in the URL
// (which a shared link puts there) WIN over stored prefs by design, so they would
// override the character's own saved layout/settings on the reload — drop them
// here, keeping foreign params (?tour=) and the hash. The character's state is
// the source of truth for a swap.
function reloadForCharacterSwap() {
  try {
    const q = new URLSearchParams(location.search);
    for (const k of window.DW_ROUTING.OPTION_NAMES) q.delete(k);
    const qs = q.toString();
    history.replaceState(null, '', (qs ? '?' + qs : location.pathname) + location.hash);
  } catch { /* file:// — nothing to rewrite */ }
  location.reload();
}

export function charActive() { return CH ? CH.activeCharacter() : null; }
export function charTotal(ch) { return ch && CH ? CH.totalLevel(ch.skills, CH.skillNames()) : 0; }

// show the tracked level on each skill hub's label ("Artisan · 12")
export function refreshSkillLabels() {
  if (!CH || !cy) return;
  const ch = charActive();
  cy.nodes().forEach(n => {
    const m = n.data('meta');
    if (!m || m.kind !== 'skill') return;
    const lv = ch ? CH.skillOf(ch, n.id()) : null;
    n.data('label', lv == null ? n.id() : `${n.id()} · ${lv}`);
  });
}

// the codex section for a skill hub — the per-node level tracker
export function charSkillSectionHTML(id) {
  if (!CH) return '';
  const ch = charActive();
  if (!ch) {
    return `<div class="p-section"><div class="p-label">Your level</div>
      <div class="p-hint">Name a character to track your <b>${esc(id)}</b> level — the number beside the character is the sum of all skills.</div>
      <div class="p-actions"><button class="btn" id="btnCharSetup">Set up a character</button></div></div>`;
  }
  const lv = CH.skillOf(ch, id);
  return `<div class="p-section"><div class="p-label">Your level<span style="flex:1"></span><span class="char-inline-total">total ${charTotal(ch)}</span></div>
    <div class="char-level-row">
      <input id="skillLevelInput" type="number" min="${CH.SKILL_MIN}" max="${CH.SKILL_MAX}" value="${lv == null ? CH.SKILL_MIN : lv}" aria-label="${esc(id)} level">
      <span class="char-level-hint">your level in ${esc(id)}</span>
    </div></div>`;
}

function renderCharPanel() {
  const listEl = document.getElementById('charList');
  if (!listEl || !CH) return;
  const data = CH.read();
  const active = charActive();
  listEl.innerHTML = data.chars.length
    ? data.chars.map(c => `<button class="char-row${c.id === data.active ? ' active' : ''}" data-char="${esc(c.id)}">
        <span class="cr-name">${esc(c.name)}</span>
        <span class="cr-lv" title="Total level">Lv ${charTotal(c)}</span>
        ${c.id === data.active ? '<span class="cr-lv">✓</span>' : ''}
      </button>`).join('')
    : '<div class="char-empty">No character yet — the atlas still works; settings stay in this browser.</div>';
  listEl.querySelectorAll('[data-char]').forEach(el => {
    el.onclick = () => {
      if (el.dataset.char === data.active) return;
      CH.activate(el.dataset.char); // snapshot out, apply in
      reloadForCharacterSwap();
    };
  });

  const nameInput = document.getElementById('charName');
  if (nameInput) {
    nameInput.value = active ? active.name : '';
    nameInput.disabled = !active;
    nameInput.onchange = () => {
      if (!active) return;
      CH.rename(active.id, nameInput.value);
      refreshCharUI();
      toast('Character renamed');
    };
  }
  const badge = document.getElementById('charTotal');
  if (badge) badge.textContent = active ? `Lv ${charTotal(active)}` : 'No character';

  const skillsEl = document.getElementById('charSkills');
  if (skillsEl) {
    const names = CH.skillNames();
    if (!active) {
      skillsEl.innerHTML = '<div class="char-empty">Name a character to track skill levels.</div>';
    } else {
      const skills = CH.normSkills(active.skills, names);
      skillsEl.innerHTML = names.map(n =>
        `<label class="char-skill">${esc(n)}<input type="number" min="${CH.SKILL_MIN}" max="${CH.SKILL_MAX}" value="${skills[n]}" data-skill="${esc(n)}" aria-label="${esc(n)} level"></label>`
      ).join('');
      skillsEl.querySelectorAll('[data-skill]').forEach(inp => {
        inp.onchange = () => { CH.setSkill(inp.dataset.skill, inp.value, active.id); refreshCharUI(); };
      });
    }
  }
  const totalLine = document.getElementById('charTotalLine');
  if (totalLine) {
    totalLine.innerHTML = active
      ? `Total level: <b>${charTotal(active)}</b> — the sum of all skill levels.`
      : '';
  }
  const del = document.getElementById('charDelete');
  if (del) del.disabled = !active;
  const adoptWrap = document.getElementById('charAdoptWrap');
  if (adoptWrap) adoptWrap.hidden = !(!active && CH.hasLiveState());
  const note = document.getElementById('charNote');
  if (note) note.textContent = active
    ? 'Layout, settings & owned items follow this character.'
    : 'No character — settings are kept in this browser only.';
}

export function refreshCharUI() {
  const ch = charActive();
  const btn = document.getElementById('charBtn');
  if (btn) {
    btn.innerHTML = ch
      ? `<span class="cb-rune">⚉</span><span class="cb-name">${esc(ch.name)}</span><span class="cb-lv" title="Total level (sum of all skills)">${charTotal(ch)}</span>`
      : '<span class="cb-rune">⚉</span><span class="cb-name">Character</span>';
    btn.title = ch
      ? `${ch.name} — total level ${charTotal(ch)}. Layout, settings and owned items are saved per character.`
      : 'No character yet — name one to save skill levels, layout, settings and owned items';
  }
  refreshSkillLabels();
  renderCharPanel();
}

// Wire the UI once, when app.js has a graph and a toast().
export function initCharactersUI({ cy: graph, toast: notify }) {
  cy = graph;
  toast = notify;

  (function ensureActiveCharacter() {
    if (!CH) return;
    const data = CH.read();
    if (data.active || !data.chars.length) return;
    // characters exist but none is marked active (e.g. hand-edited storage): adopt
    // the first once. Guarded via sessionStorage so a failed write can't reload-loop.
    const GUARD = 'dw.charActivateGuard';
    try {
      if (sessionStorage.getItem(GUARD)) { sessionStorage.removeItem(GUARD); return; }
      sessionStorage.setItem(GUARD, '1');
    } catch { /* no sessionStorage — the persisted active below settles it */ }
    CH.activate(data.chars[0].id);
    reloadForCharacterSwap();
  })();

  (function initCharPanel() {
    const btn = document.getElementById('charBtn');
    const panel = document.getElementById('charPanel');
    if (!btn || !panel || !CH) return;
    panel.addEventListener('click', e => e.stopPropagation());
    if ('showPopover' in panel) {
      panel.addEventListener('beforetoggle', e => btn.setAttribute('aria-expanded', String(e.newState === 'open')));
      btn.onclick = e => {
        e.stopPropagation();
        if (panel.matches(':popover-open')) panel.hidePopover();
        else {
          if (!CSS.supports('anchor-name: --a')) {
            const r = btn.getBoundingClientRect(); // top layer escapes the header — place manually
            panel.style.top = Math.round(r.bottom + 8) + 'px';
            panel.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
          }
          renderCharPanel();
          panel.showPopover();
        }
      };
    } else {
      let closer = null;
      const escClose = e => {
        if (e.key !== 'Escape' || panel.hidden) return;
        panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', closer); document.removeEventListener('keydown', escClose, true);
      };
      btn.onclick = e => {
        e.stopPropagation();
        const open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        if (open) {
          renderCharPanel();
          closer = ev => {
            if (panel.contains(ev.target) || ev.target === btn) return;
            panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
            document.removeEventListener('click', closer); document.removeEventListener('keydown', escClose, true);
          };
          document.addEventListener('click', closer); document.addEventListener('keydown', escClose, true);
        }
      };
    }
    const createBtn = document.getElementById('charCreate');
    if (createBtn) createBtn.onclick = () => {
      const input = document.getElementById('charNewName');
      const name = (input && input.value || '').trim();
      if (!name) { toast('Give your character a name first'); if (input) input.focus(); return; }
      const adoptBox = document.getElementById('charAdopt');
      const adopt = !charActive() && CH.hasLiveState() && !!adoptBox && adoptBox.checked;
      CH.create(name, { adopt });
      reloadForCharacterSwap();
    };
    const delBtn = document.getElementById('charDelete');
    if (delBtn) delBtn.onclick = () => {
      const a = charActive();
      if (!a) return;
      CH.remove(a.id);
      reloadForCharacterSwap();
    };
  })();

  (function initCharPrompt() {
    const modal = document.getElementById('charModal');
    if (!modal || !CH) return;
    const nameInput = document.getElementById('charModalName');
    const skip = document.getElementById('charModalSkip');
    if (skip) skip.onclick = () => { CH.markPrompted(); modal.hidden = true; };
    const doCreate = () => {
      const name = (nameInput && nameInput.value || '').trim();
      if (!name) { toast('Give your character a name first'); if (nameInput) nameInput.focus(); return; }
      const adoptWrap = document.getElementById('charModalAdoptWrap');
      const adoptBox = document.getElementById('charModalAdopt');
      const adopt = !!adoptWrap && !adoptWrap.hidden && !!adoptBox && adoptBox.checked;
      CH.markPrompted();
      CH.create(name, { adopt });
      reloadForCharacterSwap();
    };
    const createBtn = document.getElementById('charModalCreate');
    if (createBtn) createBtn.onclick = doCreate;
    if (nameInput) nameInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doCreate(); } };
    // ask once: only when there is no character and we have not asked before
    if (!charActive() && !CH.promptShown()) {
      const adoptWrap = document.getElementById('charModalAdoptWrap');
      if (adoptWrap) adoptWrap.hidden = !CH.hasLiveState(); // migration prompt only when data exists
      modal.hidden = false;
      if (nameInput) setTimeout(() => nameInput.focus(), 150);
    }
  })();
}
