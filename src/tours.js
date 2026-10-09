// Guided tours (TODO #20): one driver.js engine drives the main tour and the
// scripted mini-tours listed in the ? help window. A "step" may carry an
// `action(fn)` — run when the step is highlighted — which performs the thing
// the step describes (type into search, open a codex panel, isolate a tree…)
// so each tour is a replayable scenario, not just captions.
//
// Mini-tours answer one real question each:
//   robes   — "What do I need to build Dark Mage Robes?" (no item is literally
//             named "wizard robe"; the wiki's mage robes are Dark Mage Robes)
//   outputs — "What can I make with Ash Logs?"
//   inputs  — "What does a Blast Furnace need?"
// Deep links: ?tour=robes (etc.) start a tour once the map has booted.
//
// An ES module imported by app.js. driver.js must already have run — it is a
// classic script in index.html, and classic scripts execute before the app's
// deferred module entry. Exports DW_TOURS and mirrors it onto window.DW_TOURS.
(function () {
  'use strict';
  // driver.js 1.3.1 IIFE exposes its factory at window.driver.js.driver
  const hasDriver = !!(window.driver && window.driver.js && typeof window.driver.js.driver === 'function');
  if (!hasDriver) return; // driver.js failed to load — help text still documents everything

  // ── app helpers (app.js exposes these as globals; guard anyway) ──
  const selectNode = id => { try { window.selectNode(id); } catch (e) { console.error('tour selectNode', e); } };
  const isolateTree = id => { try { window.isolateTree(id); } catch (e) { console.error('tour isolateTree', e); } };
  const cy = () => window.__cy;

  function typeQuery(q) {
    const s = document.getElementById('search');
    if (!s) return;
    s.value = q;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function clearSearch() {
    const s = document.getElementById('search');
    if (!s) return;
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.blur();
  }
  // restore the full map after a tour (app's own reset first, manual fallback)
  function cleanup() {
    try { if (typeof window.showEverything === 'function') window.showEverything(); } catch (e) { /* noop */ }
    try {
      const c = cy();
      if (c) c.batch(() => c.elements().removeClass(['hidden', 'highlighted', 'faded']));
    } catch (e) { /* noop */ }
    clearSearch();
  }

  // ── engine ──────────────────────────────────────────────────────
  let active = null;
  function makeDriver(steps, onDone) {
    let self = null; // the hooks receive a context object, not the driver — capture it
    self = window.driver.js.driver({
      steps,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 10,
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done ✦',
      // perform the step's scripted action before the popover lands, then
      // re-measure so freshly-opened elements (panel, suggestions…) position right
      onHighlightStarted: (el, step) => {
        if (typeof step.action === 'function') {
          try { step.action(); } catch (e) { console.error('tour action', e); }
          setTimeout(() => { try { self.refresh(); } catch (e) { /* noop */ } }, 180);
        }
      },
      onDestroyStarted: () => { cleanup(); active = null; if (onDone) onDone(); try { self.destroy(); } catch (e) { /* noop */ } },
    });
    return self;
  }

  function start(name) {
    const def = TOURS[name];
    if (!def) return;
    if (active) { try { active.destroy(); } catch (e) { /* noop */ } active = null; }
    // a codex panel or old isolation from a previous session would distract
    try { document.getElementById('panelClose').click(); } catch (e) { /* noop */ }
    cleanup();
    const drv = makeDriver(def.steps, def.onDone);
    active = drv;
    try { document.getElementById('helpModal').hidden = true; } catch (e) { /* noop */ }
    drv.drive();
  }

  // ── tour definitions ────────────────────────────────────────────
  const TOURS = {
    main: {
      steps: [
        { popover: { title: '✦ Welcome to the Crafting Atlas', description: 'Every item, station, recipe and skill in Dragonwilds as one navigable map. Ninety seconds and you\'ll know every move.' } },
        {
          element: '#search',
          popover: { title: 'Find anything', description: 'Type any item, station or skill — fuzzy, instant. <kbd>/</kbd> jumps straight here from anywhere.' },
        },
        {
          element: '#cy',
          popover: { title: 'The map', description: 'One node per craftable thing; lines are recipes. Raw materials sit low, end-game gear high. Wheel zooms, drag pans.' },
          action: () => selectNode('Iron Bar'),
        },
        {
          element: '#panel',
          popover: { title: 'The codex panel', description: 'Click a node and its codex opens: every recipe & facility, what it\'s found in — and the <b>plan</b>: <b>Gather</b>, <b>Build</b>, <b>Train</b>, plus the critical chain that gates it all.' },
        },
        {
          element: '#panel',
          popover: { title: 'Shift+Click isolates a tree', description: 'Shift+Click any node to collapse the map to just its crafting tree — everything it requires plus one level of what it enables. Watch:' },
          action: () => isolateTree('Iron Bar'),
        },
        {
          element: '#legend',
          popover: { title: 'The legend runs the show', description: 'Every item kind and link kind toggles here. Hover a kind for the <b>only</b> button to solo it; <b>Dead ends</b>, <b>Possessions</b> and the view reset live at the bottom.' },
        },
        {
          element: '#settingsBtn',
          popover: { title: '⚙ Graph settings', description: '24 layout algorithms, a live density slider, and snapshots: 💾 saves your arrangement (it boots instantly from then on), ⤓ exports it to share.' },
        },
        {
          element: '#breadcrumb',
          popover: { title: 'Lineage & the plan', description: 'The breadcrumb shows how you got here; the panel\'s <b>plan</b> button cycles from-nothing → from-owned → a checkable waypoint checklist.' },
        },
        {
          element: '#helpBtn',
          popover: { title: 'Help is always here', description: 'The <b>?</b> button holds the full manual — and the mini-tours: 30-second scripted answers to real questions. Press <kbd>Esc</kbd> to leave this tour whenever you like.' },
        },
        {
          popover: { title: 'Now you', description: 'Try it: press <kbd>/</kbd>, type what you want to craft, and read the plan. ✦' },
        },
      ],
    },

    robes: {
      steps: [
        { popover: { title: '"What do I need for Dark Mage Robes?"', description: 'The wiki\'s mage robes are <b>Dark Mage Robes</b> (no item is literally named "wizard robe"). Watch the whole workflow, then repeat it with any goal.' } },
        {
          element: '#search',
          popover: { title: '1 · Search', description: 'Type "mage robes" — the fuzzy search finds it instantly. Picking a result opens its codex.' },
          action: () => typeQuery('mage robes'),
        },
        {
          element: '#panel',
          popover: { title: '3 · Read the plan', description: 'The codex opens with the from-nothing plan: <b>Gather</b> the raw materials, <b>Build</b> the stations (Armour Bench…), <b>Train</b> Artisan to the level it needs.' },
          action: () => selectNode('Dark Mage Robes'),
        },
        {
          element: '#breadcrumb',
          popover: { title: '4 · Isolate the tree', description: 'Shift+Click the node (or the panel\'s <b>Isolate tree</b> button) to show only what the robes are made of — the breadcrumb above shows the lineage.' },
          action: () => isolateTree('Dark Mage Robes'),
        },
        {
          popover: { title: '✦ That\'s the whole loop', description: 'Search → plan → isolate. Now do it with <i>your</i> goal — press <kbd>/</kbd> and type it. (This view is restored when the tour closes.)' },
        },
      ],
    },

    outputs: {
      steps: [
        { popover: { title: '"What can I make with Ash Logs?"', description: 'The reverse question — pick a raw material and see everything downstream.' } },
        {
          element: '#panel',
          popover: { title: '1 · Open the material', description: 'Searching "Ash Logs" and clicking the result opens its codex — raw materials list everything they\'re used in.' },
          action: () => selectNode('Ash Logs'),
        },
        {
          element: '#cy',
          popover: { title: '2 · Enables ⤴', description: 'The panel\'s <b>Enables ⤴</b> button highlights every item Ash Logs reach — planks, bows, stations, and on up the tree.' },
          action: () => { try { document.getElementById('btnEnables').click(); } catch (e) { /* noop */ } },
        },
        {
          popover: { title: '✦ Downstream, mapped', description: 'Use it to judge what a material is worth hoarding for. <b>Requires ⤵</b> does the mirror image (what went into a thing). Each click adds a level; <b>Step back ⤵</b> removes one level, and <b>Reset</b> wipes it all.' },
        },
      ],
    },

    inputs: {
      steps: [
        { popover: { title: '"What does a Blast Furnace need?"', description: 'Stations are nodes too — the map can price a build before you commit.' } },
        {
          element: '#panel',
          popover: { title: '1 · Open the station', description: 'Search "Blast Furnace" and open it: its codex lists the build cost — and everything craftable on it.' },
          action: () => selectNode('Blast Furnace'),
        },
        {
          element: '#cy',
          popover: { title: '2 · Requires ⤵', description: '<b>Requires ⤵</b> highlights every ingredient behind it — ore, bricks, bars — so you can gather before you build.' },
          action: () => { try { document.getElementById('btnRequires').click(); } catch (e) { /* noop */ } },
        },
        {
          popover: { title: '✦ Costed', description: 'Pair it with the plan button\'s <b>waypoint checklist</b> to actually work through the build. Each <b>Requires ⤵</b> click adds a level; <b>Step back ⤵</b> removes one level, <b>Enables ⤴</b> reverses direction, and <b>Reset</b> wipes the whole highlight. (Highlights clear when the tour closes.)' },
        },
      ],
    },
  };

  window.DW_TOURS = { names: Object.keys(TOURS), start, get active() { return active !== null; } };

  // help-window buttons (the ? modal) — delegation, since the modal is static markup
  document.getElementById('helpModal')?.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]');
    if (b) start(b.dataset.tour);
  });

  // ?tour=<name> deep link: start once the graph has booted
  const want = new URLSearchParams(location.search).get('tour');
  if (want && TOURS[want]) {
    const t0 = Date.now();
    const wait = () => {
      const booted = window.__cy && document.getElementById('veil')?.classList.contains('hidden');
      if (booted) setTimeout(() => { if (!active) start(want); }, 400);
      else if (Date.now() - t0 < 60000) setTimeout(wait, 250);
    };
    wait();
  }
})();

export const DW_TOURS = window.DW_TOURS;
