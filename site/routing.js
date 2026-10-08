/* ═══════════════════════════════════════════════════════════════
   DRAGONWILDS ✦ CRAFTING ATLAS — URL routing primitives
   ═══════════════════════════════════════════════════════════════
   Hash routes, not real paths: the atlas deploys to GitHub Pages as a
   static folder whose index.html loads every asset (data.js, app.js,
   vendor/…) by RELATIVE path. A deep real path like /ash_logs/iron_sword
   would resolve those to /ash_logs/iron_sword/data.js → 404, and would
   need a 404.html fallback plus absolute asset rewriting. A fragment
   (#/ash_logs/iron_sword) never reaches the server, so it works on
   Pages, on the Vite dev server, on the in-process test server and even
   from file:// — with no config anywhere.

   Shape:
     #/ash_logs                 → select Ash Logs
     #/ash_logs/iron_sword      → path from Ash Logs to Iron Sword

   Item identity in a URL is the snake_case slug of the display name
   ("Iron Sword" → iron_sword). The internal node ids stay the display
   names they always were — snapshots, tours, found-in and the tests all
   key off them — so this module owns the slug ⇄ id mapping instead of a
   repo-wide id migration.

   Loaded as a plain classic script before app.js; exposes DW_ROUTING.
   The same pure functions are mirrored in tests/lib/routing.ts so the
   Gherkin routing scenarios exercise this exact logic.
   ═══════════════════════════════════════════════════════════════ */
window.DW_ROUTING = (() => {
  // snake_case slug: strip accents, drop apostrophes/quotes outright
  // (Adventurer's → adventurers), spell '&' as ' and ', then squash every
  // remaining run of non-alphanumerics into a single underscore.
  function slug(name) {
    return String(name)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[\u2018\u2019\u02bc'’‘"]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // slug ⇄ id maps over an iterable of { id, name }. Two names can slug to
  // the same string (data has "Blue Dragon Leather" and "Blue  Dragon
  // Leather"); the later one gets a deterministic _2, _3, … suffix in data
  // order so every node keeps a URL that round-trips back to it alone.
  function buildIndex(nodes) {
    const toId = new Map();
    const toSlug = new Map();
    for (const n of nodes) {
      const base = slug(n.name);
      let s = base;
      for (let i = 2; toId.has(s); i++) s = `${base}_${i}`;
      toId.set(s, n.id);
      toSlug.set(n.id, s);
    }
    return { toId, toSlug };
  }

  // Tolerant parse: accepts '#/a/b', '#a/b', 'a/b' and a full URL, ignores
  // empty segments and trailing slashes, percent-decodes and lowercases.
  function parseHash(hash) {
    let h = String(hash || '');
    const i = h.indexOf('#');
    if (i >= 0) h = h.slice(i + 1);
    const segments = h.split('/')
      .map(seg => {
        try { seg = decodeURIComponent(seg); } catch { /* keep raw on bad escape */ }
        return seg.trim().toLowerCase();
      })
      .filter(Boolean);
    return { segments };
  }

  // inverse of parseHash — the fragment to put in the address bar
  function buildHash(slugs) {
    const parts = (slugs || []).filter(Boolean);
    return parts.length ? `#/${parts.join('/')}` : '#/';
  }

  /* ── graph options in the query string ──────────────────────────
     Every graph option can be set from the URL (?layout=grid&cats=all&…),
     and a value given there wins over the visitor's stored pref for the
     session. The canonical order below is also the order syncUrl() writes,
     so a given view always produces the same query string.

     kinds:
       bool  1/0 (also true/false, yes/no, on/off; a bare ?flag means on)
       int   clamped, rounded
       enum  one of `values`
       layout one of the caller's algorithm presets
       kinds  `all`, `none`, or a comma list the caller validates
       slug  a snake_case item name (the caller resolves it)
       depth `all` or an integer ≥ 1
     An unusable value is dropped (the option falls back to the stored
     pref) and its name is reported in `invalid`, so the caller can say
     so instead of silently ignoring a typo in a shared link. */
  const OPTION_PARAMS = [
    { name: 'layout', kind: 'layout' },
    { name: 'force', kind: 'bool' },
    { name: 'anim', kind: 'bool' },
    { name: 'saved', kind: 'bool' },
    { name: 'worker', kind: 'bool' },
    { name: 'dens', kind: 'int', min: 50, max: 200 },
    { name: 'auto', kind: 'bool' },
    { name: 'cats', kind: 'kinds' },
    { name: 'orphans', kind: 'bool' },
    { name: 'links', kind: 'bool' },
    { name: 'skilllinks', kind: 'bool' },
    { name: 'regions', kind: 'bool' },
    { name: 'possessions', kind: 'bool' },
    { name: 'iso', kind: 'slug' },
    { name: 'isodir', kind: 'enum', values: ['both', 'down', 'needs', 'up'] },
    { name: 'isodepth', kind: 'depth' },
  ];
  const OPTION_NAMES = OPTION_PARAMS.map(p => p.name);
  const BOOL_ON = /^(1|true|yes|on)$/i;
  const BOOL_OFF = /^(0|false|no|off)$/i;
  const TOKEN = /^[a-z0-9_-]+$/; // a layout preset, a kind, or an item slug

  function parseOptions(search, { layouts = [], kinds = [] } = {}) {
    const q = new URLSearchParams(search || '');
    const values = new Map();
    const invalid = [];
    for (const p of OPTION_PARAMS) {
      if (!q.has(p.name)) continue;
      const raw = String(q.get(p.name) ?? '').trim().toLowerCase();
      let v = null;
      if (p.kind === 'bool') {
        if (raw === '' || BOOL_ON.test(raw)) v = '1';
        else if (BOOL_OFF.test(raw)) v = '0';
      } else if (p.kind === 'int') {
        const n = Number(raw);
        if (raw !== '' && Number.isFinite(n)) v = String(Math.min(p.max, Math.max(p.min, Math.round(n))));
      } else if (p.kind === 'enum') {
        if (p.values.includes(raw)) v = raw;
      } else if (p.kind === 'layout') {
        if (layouts.includes(raw)) v = raw;
      } else if (p.kind === 'kinds') {
        if (raw === 'all' || raw === 'none') v = raw;
        else {
          const keep = [...new Set(raw.split(',').map(s => s.trim()).filter(t => kinds.includes(t)))];
          if (keep.length) v = keep.join(',');
        }
      } else if (p.kind === 'slug') {
        if (TOKEN.test(raw)) v = raw;
      } else if (p.kind === 'depth') {
        if (raw === 'all') v = 'all';
        else {
          const n = parseInt(raw, 10);
          if (Number.isFinite(n) && n >= 1) v = String(n);
        }
      }
      if (v === null) invalid.push(p.name);
      else values.set(p.name, v);
    }
    return { values, invalid };
  }

  // the whole option state as a query string (no leading '?'), in canonical
  // order. Every option is written — not just the ones that differ from the
  // defaults — because the URL is meant to REPLACE the whole state: a
  // recipient then gets exactly the sender's view instead of their own stored
  // prefs leaking in. The only omission is `iso` when nothing is isolated.
  function buildOptionsQuery(state) {
    const q = new URLSearchParams();
    for (const p of OPTION_PARAMS) {
      const v = (state || {})[p.name];
      if (v === undefined || v === null || v === '') continue;
      q.set(p.name, String(v));
    }
    return q.toString();
  }

  return { slug, buildIndex, parseHash, buildHash, OPTION_NAMES, parseOptions, buildOptionsQuery };
})();
