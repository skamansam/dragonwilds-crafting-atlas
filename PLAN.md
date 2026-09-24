# Dragonwilds Crafting Atlas — Master Plan & Status

Single source of truth for the two backlogs:

- **`TODO.md`** — product/feature backlog (UX, graph, layouts)
- **`TODO-compliance.md`** — licensing/compliance backlog (Jagex FCP, Weird Gloop, CC BY-NC-SA)

Status legend: ✅ done · 🟡 partial · ❌ todo · ⬜ needs a human (external action)
Evidence = commit hash, test, or verified code path. Update this file whenever a ticket changes state.

Current as of **2026-09-24**, after the found-in annotations + trace-makes commit (live at http://rudeboy.dev/dragonwilds-crafting-atlas/).

---

## 1. Product backlog status (from `TODO.md`)

| # | Request | Status | Evidence / notes |
|---|---------|--------|------------------|
| 1 | Graph "WAY too dense" | ✅ done (P3-1) | Skill-gate edges hidden by default (−1,477 edges on first load, persisted pref, ↺ All restores the calm default) + `elk-layered-wide` now the out-of-the-box default (airy snapshot boot) + density slider (50–200%, live re-run) with 💾 custom per-layout+density snapshots ('· custom' badge, degenerate-guard, ✕ clear) + persisted layout choice · `db538e0`, (this commit) |
| 2 | Skill trees as part of the graph | ✅ done | 12 skill hubs with 1,539 gold gate edges · `576cbe0` |
| 3 | Allow unselecting all category chips (blank screen OK) | ✅ done | Tested 1,408 → 71 visible → restore · `test-todo.mjs` |
| 4 | Isolate tree auto-reveals hidden nodes | ✅ done | Isolate turns on every category chip first · `test-todo.mjs` |
| 5 | Layout algorithm selector | ✅ done | **23 options** in `#layoutSelect` (force / trees & layered / clustering groups) · `576cbe0` + `29bfe91` + `a615a74` |
| 6 | Top-to-bottom tree layout | ✅ done | Dagre TB, ELK layered (DOWN), tidytree TB, klay DOWN |
| 7 | Check off owned items, show only reachable | ✅ done | Possessions mode, persisted in localStorage · `576cbe0` |
| 8 | Clickable facilities / items in "How to make" | ✅ done | `data-goto` chips navigate + select the node · `test-todo.mjs` |
| 9 | Isolate walks inputs **and** outputs to leaves | ✅ done | Both-direction BFS added · `29bfe91`; verified Iron Bar → Iron Sword |
| 10 | Layout-running feedback | ✅ done | Header spinner + `Arranging · <algo>` pill with 90s safety timeout · `29bfe91` |
| 10b | **Background/threaded layout so UI doesn't lock** *(added later to TODO.md)* | ✅ done (**default-on**) | Web Worker (`site/layout-worker.js`) computes layouts off-thread; bit-for-bit identical positions, 18/18 capability probe, graceful fallback; worst frame during a live re-layout 7.35s freeze → 16.8ms. See plan §3 P1-2. |
| 11 | DB counts under title/search; shown counts under layout selector | ✅ done | `#dbcounts` under brand, `#layoutMeta` (nodes/links shown + algorithm) next to select · `29bfe91` |
| 12 | Algorithm name visible; force-directed checkbox; many algorithms | ✅ done | Name shown in `#layoutMeta`; force toggle under select; 23 algorithms shipped incl. tidytree, klay, fcose, spread, d3-force, avsdf, elk×4 — user asked for **all** of them, even near-duplicates, for rendering comparisons · `a615a74` |
| 13 | Isolate depth input (default 3, forward + backward) | ✅ done | `#isoDepth` input next to Isolate button; empty = full tree; BFS both directions to the depth; persisted in localStorage · `c11553a`; verified 44 / 1,200 / 1,408 nodes at depth 1 / 3 / all |
| 14 | Switching layout during a running force layout does nothing | ✅ done | `runLayout()` now `stop()`s the active layout and starts the new preset; superseded layouts no longer clobber state · `c11553a`; verified mid-flight cola→dagre switch |
| 15 | **Toggle to disable layout animations** (`animate: false`) *(added later)* | ✅ done | **animate** checkbox in the header, persisted; `runLayout()` strips animation options · `01faff1` |
| 16 | **Speed up physics layouts** with `maxIterations` / `maxSimulationTime` caps *(added later)* | ✅ done | Audited per extension: `numIter` for bilkent/fcose, existing `maxSimulationTime` on cise/cola/euler; tuned `CAPS` table (blanket 1000/3000 rejected — too tight for 1,408 nodes) · `01faff1` |
| 17 | **Precomputed/preset layouts** (store positions per algorithm; Cytoscape desktop to author) *(added later)* | ✅ done | `scripts/gen-layouts.mjs` → `site/layouts/manifest.js` (elk-layered + cose-bilkent snapshots); **saved positions** toggle applies instantly, **· saved** badge; Desktop-authored configs drop into the manifest · `01faff1` |
| 18 | **Path-to: top search panel** for picking the link target *(added later)* | ✅ done | Dedicated **Path-to bar** at the top of the map: pulsing gold while armed (source + instructions), calm summary with step count once resolved, ✕ cancel + Esc · (this commit); search-pick and map-tap targeting unchanged · `543d983` |
| 19 | **Research: offload layouts to a service worker / worker thread** *(added later)* | ✅ done | Answered: dedicated Worker (not service worker); see row 10b + plan §3 P1-2 for the numbers and verdict. |

---

## 2. Compliance backlog status (from `TODO-compliance.md`)

| Ticket | Request | Status | Evidence / notes |
|--------|---------|--------|------------------|
| 01 | Jagex FCP §8.1 attribution line, **verbatim**, in README + app UI | ✅ done | Exact wording in README (Attribution & legal) + app legend (`lg-legal`) + welcome card · `c11553a` |
| 02 | Non-affiliation / non-endorsement disclaimer (README + app) | ✅ done | README disclaimer with trademark credit; in-app wording in welcome card + legend · `c11553a` |
| 03 | "Non-commercial in perpetuity" statement at top of README | ✅ done | Blockquote directly under the intro · `c11553a` |
| 04 | AI-generated disclosure in README | ✅ done | "AI-generated disclosure" section · `c11553a` |
| 05 | LICENSE (code) + LICENSE-DATA.md (dataset CC BY-NC-SA, icons under Jagex FCP) | ✅ done | MIT `LICENSE` with scope exclusions; `LICENSE-DATA.md` splits dataset/icons/fonts; README "Licensing" section links all three |
| 06 | Weird Gloop attribution: deep links per reused page | ✅ done | `scripts/audit-links.mjs`: 1,898/1,963 (96.7%) deep-linked; the 65 unlinked are pageless implicit/variant nodes (documented, no fabricated URLs). Fixed build-data to stop fabricating wiki URLs for pageless nodes. |
| 07 | Scrape via MediaWiki API, not rendered HTML | ✅ done | `fetch-wiki.mjs` uses `api.php` exclusively (line 6). |
| 08 | Rate limiting + descriptive User-Agent with contact | ✅ done | Shared `scripts/wiki-config.mjs`: ~1 req/s default (`RATE_MS` env override) + UA with repo URL and contact; all three fetch scripts use it; documented in README |
| 09 | Document manual-snapshot cadence, no scheduled re-scrape | ✅ done | README states manual snapshot, no scheduled/automated re-scraping, deploy workflow uploads only |
| 10 | Outreach email to Weird Gloop | ⬜ human | External action; log outcome in COMPLIANCE.md. |
| 11 | Outreach email to Jagex (§6.1.3 "software/application" clause) | ⬜ human | External action; highest-value legal de-risk. |
| 12 | `COMPLIANCE.md` decision log | ✅ done | Created with dated decisions + pending-outreach slots for tickets 10/11 |

---

## 3. Work plan (priority order)

### P0 — Pathfinding: "what do I need to craft this?" (2026-09-22, the project's core question)

The README purpose statement makes the priority explicit: answer **"What do I need to do to craft
this thing from what I have now?"** first; browsing second. Three deliverables:

- **PF-1 · "From nothing" panel section** — ✅ done: Gather/Build/Train chips with total
  quantities, plus the critical chain (longest prerequisite run, followed top-down). Renders
  for all 1,144 craftable items; raw/gatherables get a hint + the Path-to query instead.
- **PF-2 · Two-node path query** — ✅ done: **Path to…** button arms a crosshair mode; tapping
  the target (on the map *or* picked from the search box, which pulses gold while armed)
  runs BFS over material edges (skill gates excluded), highlights the gold trail and lists
  numbered steps with facilities. Esc clears. Verified Ash Logs → Iron Sword (3 steps) and
  Copper Ore → Iron Sword via search pick (4 steps).
- **PF-3 · Possessions-aware plans & paths** — ✅ done 2026-09-22: plans ("From nothing")
  respect the ledger when **plan: owned** is active — owned materials move to an **Already
  own** bucket, their branches stop expanding, and the Critical chain truncates at the first
  owned anchor. Paths gain **From owned → this** (raw + crafted panels, hidden if the target
  is itself owned): multi-source BFS seeded with everything in the ledger finds the shortest
  route **from anything you hold**. Arming works from map taps and search picks alike.
  Verified on the deployed site via `probe-live.mjs pf3 --url=…`.
- **PF-4 · Waypoint checklist** — ✅ done 2026-09-22: the plan button cycles **nothing →
  owned → waypoint** (persisted). Waypoint mode renders the remaining work as an ordered,
  checkable list from the ledger to the target: Kahn topological order over needed items
  (gathers first, inputs before outputs) with un-owned stations injected as Build steps
  before their first use. Checking a step adds the item to the ledger and re-plans; uncheck
  to revert. Planner refactored into shared `walkPlan()` (also collects per-item craft /
  gather quantities) + `planFromNothing()` + `planChecklist()`.
- **PF-4b · Waypoint progress header** — ✅ done 2026-09-23: per-target progress record
  (`dw.wpProgress`, persisted): *X of N steps done · R re-plans* with a **reset** button.
  `total` is the first step count seen for the target, `done` = total − current steps,
  `replans` counts check-off/uncheck/re-plan cycles; reset deletes the record and
  re-baselines. Probe-verified (render, check-off increment, reset, cleanup hardened).

### P1.5 — layout performance & presets (TODO #15, #16, #17) — ✅ done 2026-09-23

- **P1.5-1 · Animation disable toggle** *(TODO #15)* — ✅ **animate** checkbox in the header
  (persisted `dw.animate`); `runLayout()` strips `animate`/`animationDuration`/`animationEasing`
  when off; the 90s indicator safety-net drops to 25s in that mode.
- **P1.5-2 · Per-preset simulation caps** *(TODO #16)* — ✅ audited all vendor extensions:
  bilkent/fcose expose `numIter` (default 2500), cise/cola/euler already had
  `maxSimulationTime`/`maxIterations` in their presets, avsdf/spread have no cap hook.
  Added a `CAPS` table (cose-bilkent 2500, tight 2000, cose 2500, fcose 1800). The requested
  blanket 1000/3000 remains rejected — cola alone needs 4s+ at 1,408 nodes.
- **P1.5-3 · Precomputed preset positions** *(TODO #17)* — ✅ `scripts/gen-layouts.mjs` runs
  layouts headlessly (playwright) and merges results into `site/layouts/manifest.js`
  (`window.DW_LAYOUTS`); bundled snapshots: **elk-layered** (17s) and **cose-bilkent** (47s).
  `runLayout()` applies a snapshot instantly when the **saved positions** checkbox is on
  (persisted `dw.savedLayouts`) and the algorithm line shows **· saved**; live recompute
  clears the badge. Desktop-authored positions can be added to the manifest in the same
  `{ algo: { nodeId: { x, y } } }` shape.

### P0·previous — broken behavior & the two new TODO items ✅ done 2026-09-22 (`c11553a`)

- **P0-1 · Fix silent layout-switch drop** *(TODO #14)* — done: `activeLayout.stop()` + superseded-layout guard in `runLayout()`; verified mid-flight switch.
- **P0-2 · Isolate depth control** *(TODO #13)* — done: `#isoDepth` input (default 3, blank = all), bidirectional depth-limited BFS; verified 44/1,200/1,408.

### P1 — high-value compliance & robustness

- **P1-1 · Scraper etiquette finish** *(compliance 08)* — ✅ done: `scripts/wiki-config.mjs` shared config, ~1 req/s default, descriptive UA in all fetch scripts.
- **P1-2 · Layout threading spike** *(TODO #10b + #19)* — ✅ **shipped 2026-09-24, behind the `worker layout` checkbox (off by default) — verdict: WORKS, default-on deferred** (saved-positions already makes the common paths instant; the worker only pays off for live recomputes, and the checkbox documents the choice). Implementation:
  - `site/layout-worker.js`: headless cytoscape in a dedicated Worker with DOM shims
    (inert elements, rAF → setTimeout 16ms), all vendor extensions imported in the exact
    index.html order — the `window['d3-force'] = window.d3` shim must sit **between**
    d3-force.js and cytoscape-d3-force.js (webpack external read at registration time),
    FDLayout-family presets need `animate:false` ('during' animation needs main-thread
    machinery). Protocol: `ping` → empirical capability probe (each preset on a 3-node
    graph, 5s window; d3 needs `alphaDecay` — the d3-timer setTimeout(17ms) fallback makes
    the default decay ~5s), `layout` → positions at layoutstop, deferred destroy (d3-force
    fires a second end() after layoutstop — an immediate destroy kills the worker).
  - app.js: persisted toggle (`dw.worker`), job-map + run-sequence token so superseded
    results are dropped, functions stripped before postMessage (d3 `linkId` re-injected
    worker-side), degenerate-result guard, graceful main-thread fallback with a toast.
  - Measured (1,963 nodes, headless box): worker elk-layered-wide **bit-for-bit identical**
    to the main thread AND to the shipped bundled manifest (maxΔ 0); cose-bilkent
    ≈26s worker vs ≈27s main; d3-force 3.8s main vs 5.4s worker (d3-timer 17ms tick
    shim overhead); capabilities 18/18.
  - **Jank (the spike's question):** during an animate-off cose-bilkent re-layout of the
    visible graph, frames >50ms drop from 1 to 0 and worst-frame 83ms → 33ms with the
    worker on. Layout compute no longer blocks the UI thread.
  - **Ship/park:** shipped behind the toggle (probe section `p12` verifies capabilities,
    fidelity and the app path end-to-end) — and **default-ON since 2026-09-24**
    (`dw.worker` defaults to enabled, opt-out persisted). First-load feel re-measured on
    the 1,963-node map: the snapshot boot is instant either way (~0.5s to interactive);
    the first live recompute (density-slider drag on elk-layered-wide) settles in ~7.5s
    both ways, but with the worker the worst rAF frame is **16.8ms** vs a **7.35s
    main-thread freeze** without it — animate:false elk runs synchronously on the main
    thread, so default-on removes the only long UI freeze in the product. Opt-out remains
    one click for anyone who wants zero background thread usage.
- **P1-3 · Verbatim attribution block** *(compliance 01–04)* — ✅ done `c11553a`: all four texts in README + Jagex sentence in app legend/welcome card.

### P2 — licensing & docs

- **P2-1 · LICENSE (MIT) + LICENSE-DATA.md** *(compliance 05)* — ✅ done.
- **P2-2 · Snapshot wording** *(compliance 09)* — ✅ done.
- **P2-3 · COMPLIANCE.md** *(compliance 12)* — ✅ done.
- **P2-4 · Deep-link audit** *(compliance 06)* — ✅ done: `scripts/audit-links.mjs` (96.7% coverage; 65 pageless implicit nodes are the only exceptions). Exposed and fixed a real bug: build-data used to fabricate wiki URLs for every node.

### P3 — polish / backlog grooming

- **P3-1 · Density pass** *(TODO #1)* — after P0-1/P0-2, re-evaluate the default view: candidate defaults are Cola (airy) or cose-bilkent with `idealEdgeLength ≥ 130`; consider edge-bundling or hiding skill edges by default on first load.
- **P3-2 · Layout retention** — remember last layout + force toggle in localStorage.
- **P3-3 · Groom TODO.md** — once this plan is adopted, TODO.md items can be pruned/marked to avoid two divergent lists (this file becomes the tracker).
- **P3-4 · Human actions** *(compliance 10, 11)* — send the two outreach emails; log results in COMPLIANCE.md. Cannot be done by the agent.

### P4 — where things come from & the reverse graph question (2026-09-24)

- **P4-1 · Found-in annotations** — ✅ done: `scripts/build-found-in.mjs` mines the cached
  wiki wikitext (`cache/raw/<pageid>.json`) for where each item is found and how it is
  gathered, emitting `site/found-in.js` (`window.DW_FOUND_IN`, guarded load). Parser:
  infobox `|location =` (authoritative) + `|tool =` fallback for mined/chopped, then a
  clause-level prose scan — comma-clauses pair each region with its NEAREST method/tool
  mention ("found in chests in Ghornfell" → chest, not farmed); "(except X)" clauses are
  exclusions, never locations; region-less clauses borrow the nearest method sentence
  ("…Bramblemead Valley… They can be felled with any logging axes" → chopped + axe);
  method-only fallback when no region is named. 575 items annotated (123 with regions,
  452 method-only; Fractured Plains 56, Ghornfell 28, Bramblemead 22…). Panels render a
  **Found in** section (region → methods + tool); canonical regions: Temple Woods,
  Bramblemead Valley, Fractured Plains, Bloodblight Swamp, Whispering Swamp, Ghornfell,
  Bleakfields Valley (Ashenfall = the whole world, never a region).
  **Follow-up (not started):** region pseudo-nodes on the map so the rows can jump.
- **P4-1b · Region pseudo-nodes** — ✅ done 2026-09-24: the seven canonical Ashenfall
  regions become green hub nodes built at boot from `DW_FOUND_IN` (NOT in data.json —
  exports, db counts and every `D.edges` walk stay recipe-only). Each hub spokes to the
  items the wiki prose places there (`regionEdge` class, soft green). Design details:
  regions only materialize when the parser found ≥1 annotated find (Bleakfields Valley is
  named only in quest/lore prose, so it correctly gets no hub); hubs are visible but muted
  (opacity 0.35) until **legend → LINKS → Region links** is enabled (persisted
  `dw.showRegionEdges`, default off — geography ≠ crafting); Found-in panel rows now jump
  (`data-goto`) to the hub, whose panel lists everything found there (clickable back);
  regions are searchable; orphan detection ignores region spokes (drop-only items stay
  orphans); snapshot fallback places region hubs at the centroid of their laid-out
  neighbours (they are absent from pre-region manifests); isolate/trace never include
  regions. Probe `isolate` fixed: it "simulated" shift-tap via `emit('tap', {originalEvent})`
  — cytoscape drops synthetic originalEvents, so the old assertion was vacuous (it was
  counting boot-visible nodes); it now calls `isolateTree` directly and asserts 1,408.
- **P4-2 · "What does this item allow me to craft?"** — ✅ done: the panel already lists
  **Used to make** (direct recipes); the new **Trace makes ⤴** button runs the forward
  trace (`traceOutputs`, mirror of `traceInputs`): highlights the whole downstream subtree
  (direct + transitive) in the traced style, toast with direct/total counts. The graph
  question now has both directions: Trace inputs ← item → Trace makes ⤴.
- **P4-3 · Explore-tree isolation may be too greedy** — ⬜ parked (user decision: isolation
  stays as-is for now). The both-direction walk-to-leaves pulls in nearly the whole graph
  for hub items (bars/logs). Candidate approaches if revisited: direction-dominant walk,
  default depth cap, or an explicit "full tree" choice. Recorded in TODO.md.

---

## 4. Research notes

- **Layouts evaluated** (per the cytoscape layouts blog + js-perf matrix): `preset`, `random`, `grid`, `circle`, `concentric`, `breadthfirst`, `dagre`, `cose`, `cose-bilkent`, `cola`, `euler`, `cise`, `elk` (layered/force/mrtree/radial/stress/disco/box), `klay`, `fcose`, `tidytree`, `spread`, `avsdf`, `d3-force`.
- **Shipped in the dropdown (23):** cose-bilkent (default) + tight, cose, fcose (patched external, dual layout-base/cose-base v1+v2 chain), spread (explicit 4600×3300 boundingBox), euler, d3-force (v2 + quadtree/dispatch/timer; `linkId` must be a function), cola, avsdf (tight nodeSeparation), tidytree (TB/LR), dagre (TB/LR), elk-layered/force/mrtree/radial, klay (`inLayerSpacingFactor` — its adapter has no `layerSpacing` key), breadthfirst, cise, concentric, circle, grid, random.
- **Per user request all near-duplicates ship** — similar algorithms can render the same graph differently, so discrepancies are features for comparison.
- **Known algorithm limits on this full DAG (1,408 nodes):** tidytree degenerates (tree algo on a DAG: 138k×219); elk-radial silently no-ops (needs rooted/tree graph — `runLayout()` now detects untouched positions and tells the user); avsdf/klay produce huge-but-valid layouts (one ring / few giant layers — geometrically inherent).
- **Measured bounds baseline:** cola 3,529×1,773 (airiest), euler tuned 1,605×1,303 (gravity ≤ 0.05 or it collapses), spread 4,576×3,236, d3-force 2,982×3,198, elk-force 21,608×38,001, avsdf 20,471×21,291.

## 5. Verification toolkit

| Tool | Covers |
|------|--------|
| `node scripts/probe-live.mjs [section]` | Self-contained smoke probe (in-process server): layouts, isolate, force toggle; no external server needed |
| `node scripts/test-todo.mjs` | Full TODO-fix regression suite (server on :8477 required) |
| `node scripts/test-site.mjs` | Original site smoke test |
| `python3` + networkx | GraphML round-trip: read `site/data.graphml`, verify counts/attrs/types/positions, write-back re-export (verified 3.7: 1,963/4,912, MultiDiGraph, interactions craft 3309 / spell 64 / skill-gate 1539, zero dangling) |
| GitHub Actions | Deploys `site/` on every push to `main` — the live check |

## 6. Change log

| Date | Commit | Summary |
|------|--------|---------|
| 2026-09-22 | `b59dd2c` | Initial atlas: scraper pipeline, dataset, graph site |
| 2026-09-22 | `576cbe0` | Skill nodes, layout selector, possessions, edge filters, facility links |
| 2026-09-22 | `29bfe91` | 6 new layouts, force toggle, layout indicator, header rework, both-direction isolate |
| 2026-09-22 | `be0b101` | PLAN.md status board |
| 2026-09-22 | `c11553a` / `90ce587` | Layout-switch fix, isolate depth control, compliance P0 texts (tickets 01–04) |
| 2026-09-22 | `23d3c22` | Probe supports external `--url`; production verified |
| 2026-09-22 | (this commit) | P1/P2 hygiene: etiquette config, LICENSE split, COMPLIANCE.md, honest deep-link audit (tickets 05, 06, 08, 09, 12) · see `git log` for hash |
| 2026-09-22 | `a615a74` | 10 more layouts (tidytree, fcose, spread, d3-force, avsdf, klay, elk mrtree/radial) + probe battery upgrades |
| 2026-09-22 | `9beacd4` | README purpose statement; PF-1 "From nothing" plan + PF-2 two-node path query (PLAN P0 pathfinding) |
| 2026-09-22 | `543d983` | Path-to via search pick; breadthfirst restored to dropdown; no-op layout detector; full 23-layout battery pass |
| 2026-09-22 | `bf1f194` | PLAN.md resync with TODO.md (items 15–19 added; statuses corrected) |
| 2026-09-22 | `13a2843` | README full feature tour; in-app help modal (?, header button; Esc/backdrop close) |
| 2026-09-22 | `56b0c54` | PF-3: plans & paths from owned items (have/need split, chain truncation, multi-source "From owned" path) |
| 2026-09-23 | `55e1032` | PF-4 waypoint checklist: 3-state plan mode, ordered checkable steps, check-off → ledger; PF-3 verified on production |
| 2026-09-23 | `50e67c6` | biome config; canonical site/data.json export (strict JSON from DW_DATA) |
| 2026-09-23 | `33c2fab` | `scripts/build-cyjs.mjs` → site/data.cyjs: Cytoscape Desktop-importable network (all metadata as table columns, layered seed layout) |
| 2026-09-23 | `e79a1e1` | Exporter → `build-exports.mjs`: adds data.graphml (typed GraphML) + atlas-style.xml (vizmap style: node kind → fill/shape, edge interaction → stroke/dash/width) |
| 2026-09-23 | `802a419` | PF-4b waypoint progress header (X of N done · re-plans · reset, persisted per item) |
| 2026-09-23 | `01faff1` | P1.5 batch: animate toggle, per-preset simulation caps (CAPS table), precomputed layout snapshots (gen-layouts.mjs + saved-positions toggle + '· saved' badge) |
| 2026-09-23 | `db538e0` | P3-1 density pass (skill edges hidden by default, calmer cose-bilkent + fresh snapshot) + Path-to bar (TODO #18) |
| 2026-09-23 | (this commit) | `elk-layered-wide` calm-boot preset + snapshot (gen-layouts.mjs); layout choice persisted (`dw.layout`); probe `p18` section (first-load density + pathbar flow) |
| 2026-09-23 | `835e647` | OOTB default → elk-layered-wide; density slider (50–200%, live, persisted) + 💾 custom snapshots per layout@density (flat manifest-shape, layoutstop capture, sanity guard, '· custom' badge, ✕ clear) |
| 2026-09-24 | `65ddc30` | Legend fix: repaired corrupted `.lg-title` CSS block; legend now lists all 15 node kinds (Ammo/Drinks/Resources/Uncatalogued added; chip-less kinds non-clickable) |
| 2026-09-24 | `0d4e6a8` | Time-calibrated **progress bar** in the Arranging pill (per-preset seed table + EMA of finished runs; decelerating tail; correct cleanup on supersede/saved paths). Partially addresses TODO "layout feedback" (P1-2 worker spike still open) |
| 2026-09-24 | `0138446` | **Shared curated snapshots**: ⤓ export button (downloads the 💾 snapshot as `dw-snapshot` JSON), `scripts/merge-snapshots.mjs` (validates: bbox/coords/node-ids — then merges into `site/layouts/curated.js`, `--list`/`--drop`), app precedence own 💾 → curated → bundled, '· curated' badge |
| 2026-09-24 | `f129a20` | **Legend becomes the filter surface**: all 15 item kinds + both link kinds toggle from the legend (Recipe links cool-blue vs gold Skill gates; persisted `dw.showMatEdges`), new **Show everything** master row; header kind/link chips retired (hidden, mirrored); fixed `applyCategoryVisibility` clobbering edge-pref hiding (category toggles used to reveal the 1,539 hidden skill edges) |
| 2026-09-24 | `ac5c295` | **Found-in annotations + Trace makes ⤴ (P4-1/P4-2)**: `build-found-in.mjs` mines wiki prose → `site/found-in.js` (575 items: region + gather method + tool; clause-proximity pairing, except-clause exclusions, infobox location/tool); **Found in** panel section; **Trace makes ⤴** forward-trace button (downstream subtree + counts). P4-3 recorded: explore-tree isolation may be too greedy — parked, unchanged |
| 2026-09-24 | (this commit) | **P1-2 Web Worker layout spike shipped** behind the `worker layout` toggle (`site/layout-worker.js`: headless cytoscape + all extensions in a Worker, DOM shims, empirical capability probe 18/18, deferred destroy for d3-force's second end()). app.js: persisted toggle, supersede-safe job map, function-stripping + linkId re-injection, degenerate guard, main-thread fallback. Verified bit-for-bit fidelity + jank 83→33ms worst-frame; default-on parked — full verdict in plan §3 P1-2 |
| 2026-09-24 | (this commit) | **Region pseudo-nodes (P4-1b)**: 6 green region hubs built from found-in data (Bleakfields Valley legitimately empty); Found-in rows jump to them, hub panels list their items; **Region links** legend row (persisted, default off); muted hubs until revealed; searchable; excluded from exports/plans/isolation; snapshot centroid fallback; probe `isolate` un-vacuumed (direct isolateTree call, asserts 1,408) |
