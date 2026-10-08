/* ═══════════════════════════════════════════════════════════════
   DRAGONWILDS ✦ CRAFTING ATLAS — per-character state (TODO #24)

   Every character keeps its OWN graph state — the chosen layout, the ⚙ and
   legend settings, the owner ledger, plans and highlights — plus one level per
   skill. The level shown next to a character's name is the total: the sum of
   all its skill levels.

   The app's live `dw.*` keys always describe the ACTIVE character. Switching
   snapshots the live keys into the outgoing character and applies the incoming
   character's saved state; a character with no saved state yet is a clean
   slate (its keys are cleared so the app's own defaults apply). The page is
   reloaded after a switch, so every part of the app re-reads the new state.

   This module owns only that schema and swap — it touches nothing else and is
   loaded before app.js as a plain classic script.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const KEY = 'dw.characters';            // the whole roster, as JSON
  const PROMPTED_KEY = 'dw.charPrompted'; // "we asked once" — never nag twice
  const SKILL_MIN = 1;
  const SKILL_MAX = 99;

  // Graph state that follows a character. `dw.characters` (this roster),
  // `dw.charPrompted` and `dw.settingsOpen` (UI chrome) and `dw.customLayouts`
  // (shared/exported snapshots) stay app-wide.
  const STATE_KEYS = [
    'layout', 'dens', 'animate', 'savedLayouts', 'worker', 'autoRelayout',
    'showMatEdges', 'showSkillEdges', 'showRegionEdges', 'legendKinds',
    'showOrphans', 'owned', 'planMode', 'planUseOwned', 'wpProgress',
    'isoDepth', 'isoDir', 'highlight', 'force',
  ];

  const store = () => window.localStorage;

  function skillNames() {
    const d = window.DW_DATA;
    return d && Array.isArray(d.skills) ? d.skills.map(s => s.name) : [];
  }

  function clampLevel(v) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return SKILL_MIN;
    return Math.max(SKILL_MIN, Math.min(SKILL_MAX, n));
  }

  function blankSkills(names) {
    const out = {};
    for (const n of (names || skillNames())) out[n] = SKILL_MIN;
    return out;
  }

  // keep only known skills, at sane levels — corrupt storage can't poison the UI
  function normSkills(input, names) {
    const out = blankSkills(names);
    if (input && typeof input === 'object') {
      for (const n of Object.keys(out)) {
        if (input[n] !== undefined && input[n] !== null) out[n] = clampLevel(input[n]);
      }
    }
    return out;
  }

  function totalLevel(skills, names) {
    const s = normSkills(skills, names);
    return Object.values(s).reduce((a, b) => a + b, 0);
  }

  function cleanName(name) {
    const n = String(name == null ? '' : name).trim().slice(0, 40);
    return n || 'Adventurer';
  }

  // rename migration: a character's saved state may still carry the old `trace`
  // key (snapshotted before the trace→highlight rename) — move it so it survives
  function migrateStateObj(state) {
    if (state && Object.hasOwn(state, 'trace') && !Object.hasOwn(state, 'highlight')) {
      state.highlight = state.trace;
      delete state.trace;
    }
    return state;
  }

  function emptyStore() { return { active: null, chars: [] }; }

  function normalizeStore(raw, names) {
    const out = emptyStore();
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.chars)) return out;
    const seen = new Set();
    for (const c of raw.chars) {
      if (!c || typeof c !== 'object' || !c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      out.chars.push({
        id: String(c.id),
        name: cleanName(c.name),
        skills: normSkills(c.skills, names),
        state: migrateStateObj(c.state && typeof c.state === 'object' ? c.state : null),
        createdAt: Number(c.createdAt) || 0,
      });
    }
    if (out.chars.some(c => c.id === raw.active)) out.active = raw.active;
    return out;
  }

  /* ── the live graph state (the app's dw.* keys) ─────────────── */
  function snapshotState(s) {
    const st = s || store();
    const out = {};
    for (const k of STATE_KEYS) {
      const v = st.getItem('dw.' + k);
      if (v !== null) out[k] = v;
    }
    return out;
  }

  // apply a character's state; a null state clears the keys so the app falls
  // back to its own defaults (a genuinely new character starts clean)
  function applyState(state, s) {
    const st = s || store();
    for (const k of STATE_KEYS) {
      if (state && Object.hasOwn(state, k)) st.setItem('dw.' + k, state[k]);
      else st.removeItem('dw.' + k);
    }
  }

  function hasLiveState(s) {
    const st = s || store();
    return STATE_KEYS.some(k => st.getItem('dw.' + k) !== null);
  }

  /* ── roster read/write ──────────────────────────────────────── */
  function read(s) {
    const st = s || store();
    try { return normalizeStore(JSON.parse(st.getItem(KEY) || 'null'), skillNames()); }
    catch { return emptyStore(); }
  }

  function write(data, s) {
    const st = s || store();
    try { st.setItem(KEY, JSON.stringify(data)); } catch { /* full or blocked */ }
  }

  function findChar(data, id) { return data.chars.find(c => c.id === id) || null; }

  function activeCharacter(s) {
    const data = read(s);
    return findChar(data, data.active);
  }

  function skillOf(ch, name) {
    if (!ch) return null;
    return normSkills(ch.skills, skillNames())[name] ?? null;
  }

  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ── operations (callers reload the page afterwards) ────────── */
  // create a character and make it active. adopt=true keeps the current live
  // settings & ledger with it (the migration path); adopt=false starts clean.
  function create(name, opts, s) {
    const st = s || store();
    const data = read(st);
    const cur = findChar(data, data.active);
    if (cur) cur.state = snapshotState(st); // never lose the outgoing edits
    const adopt = !!(opts && opts.adopt);
    const ch = {
      id: uid(), name: cleanName(name),
      skills: blankSkills(skillNames()), state: null, createdAt: Date.now(),
    };
    if (adopt) ch.state = snapshotState(st);
    else applyState(null, st);              // fresh slate
    data.chars.push(ch);
    data.active = ch.id;
    write(data, st);
    return ch;
  }

  // switch the active character: snapshot the outgoing one, apply the incoming one
  function activate(id, s) {
    const st = s || store();
    const data = read(st);
    const cur = findChar(data, data.active);
    if (cur) cur.state = snapshotState(st);
    const next = findChar(data, id);
    if (next) { applyState(next.state, st); data.active = next.id; }
    else { applyState(null, st); data.active = null; }
    write(data, st);
    return next;
  }

  function remove(id, s) {
    const st = s || store();
    const data = read(st);
    const wasActive = data.active === id;
    data.chars = data.chars.filter(c => c.id !== id);
    if (wasActive) {
      const next = data.chars[0] || null;
      data.active = next ? next.id : null;
      applyState(next ? next.state : null, st);
    }
    write(data, st);
    return data;
  }

  function rename(id, name, s) {
    const st = s || store();
    const data = read(st);
    const ch = findChar(data, id);
    if (ch) { ch.name = cleanName(name); write(data, st); }
    return ch;
  }

  // set one skill level (defaults to the active character)
  function setSkill(name, level, id, s) {
    const st = s || store();
    const data = read(st);
    const ch = findChar(data, id || data.active);
    if (!ch) return null;
    ch.skills = normSkills(ch.skills, skillNames());
    ch.skills[name] = clampLevel(level);
    write(data, st);
    return { char: ch, total: totalLevel(ch.skills, skillNames()) };
  }

  function promptShown(s) { return (s || store()).getItem(PROMPTED_KEY) === '1'; }
  function markPrompted(s) { try { (s || store()).setItem(PROMPTED_KEY, '1'); } catch { /* blocked */ } }

  // rename migration: move a legacy live `dw.trace` key to `dw.highlight` so the
  // active character's saved highlight state is not lost.
  try {
    const st = store();
    if (st.getItem('dw.trace') !== null && st.getItem('dw.highlight') === null) {
      st.setItem('dw.highlight', st.getItem('dw.trace'));
    }
    st.removeItem('dw.trace');
  } catch { /* blocked */ }

  window.DW_CHARACTERS = {
    KEY, PROMPTED_KEY, STATE_KEYS, SKILL_MIN, SKILL_MAX,
    skillNames, clampLevel, blankSkills, normSkills, totalLevel, cleanName,
    emptyStore, normalizeStore,
    snapshotState, applyState, hasLiveState,
    read, write, findChar, activeCharacter, skillOf, uid,
    create, activate, remove, rename, setSkill,
    promptShown, markPrompted,
  };
})();
