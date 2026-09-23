# Dragonwilds Crafting Atlas — Master Plan & Status

Single source of truth for the two backlogs:

- **`TODO.md`** — product/feature backlog (UX, graph, layouts)
- **`TODO-compliance.md`** — licensing/compliance backlog (Jagex FCP, Weird Gloop, CC BY-NC-SA)

Status legend: ✅ done · 🟡 partial · ❌ todo · ⬜ needs a human (external action)
Evidence = commit hash, test, or verified code path. Update this file whenever a ticket changes state.

Current as of **2026-09-22**, after commit `543d983` (live at http://rudeboy.dev/dragonwilds-crafting-atlas/).

---

## 1. Product backlog status (from `TODO.md`)

| # | Request | Status | Evidence / notes |
|---|---------|--------|------------------|
| 1 | Graph "WAY too dense" | 🟡 partial | Dead-ends toggle (591 leaf items) removed the worst clutter; force toggle + spacing presets + Cola (3.5k×1.8k spread) offer relief. Full density rework still open. |
| 2 | Skill trees as part of the graph | ✅ done | 12 skill hubs with 1,539 gold gate edges · `576cbe0` |
| 3 | Allow unselecting all category chips (blank screen OK) | ✅ done | Tested 1,408 → 71 visible → restore · `test-todo.mjs` |
| 4 | Isolate tree auto-reveals hidden nodes | ✅ done | Isolate turns on every category chip first · `test-todo.mjs` |
| 5 | Layout algorithm selector | ✅ done | **23 options** in `#layoutSelect` (force / trees & layered / clustering groups) · `576cbe0` + `29bfe91` + `a615a74` |
| 6 | Top-to-bottom tree layout | ✅ done | Dagre TB, ELK layered (DOWN), tidytree TB, klay DOWN |
| 7 | Check off owned items, show only reachable | ✅ done | Possessions mode, persisted in localStorage · `576cbe0` |
| 8 | Clickable facilities / items in "How to make" | ✅ done | `data-goto` chips navigate + select the node · `test-todo.mjs` |
| 9 | Isolate walks inputs **and** outputs to leaves | ✅ done | Both-direction BFS added · `29bfe91`; verified Iron Bar → Iron Sword |
| 10 | Layout-running feedback | ✅ done | Header spinner + `Arranging · <algo>` pill with 90s safety timeout · `29bfe91` |
| 10b | **Background/threaded layout so UI doesn't lock** *(added later to TODO.md)* | ❌ todo | See plan §3, item P1-2. Cytoscape layouts run on the main thread; off-thread is possible but non-trivial. |
| 11 | DB counts under title/search; shown counts under layout selector | ✅ done | `#dbcounts` under brand, `#layoutMeta` (nodes/links shown + algorithm) next to select · `29bfe91` |
| 12 | Algorithm name visible; force-directed checkbox; many algorithms | ✅ done | Name shown in `#layoutMeta`; force toggle under select; 23 algorithms shipped incl. tidytree, klay, fcose, spread, d3-force, avsdf, elk×4 — user asked for **all** of them, even near-duplicates, for rendering comparisons · `a615a74` |
| 13 | Isolate depth input (default 3, forward + backward) | ✅ done | `#isoDepth` input next to Isolate button; empty = full tree; BFS both directions to the depth; persisted in localStorage · `c11553a`; verified 44 / 1,200 / 1,408 nodes at depth 1 / 3 / all |
| 14 | Switching layout during a running force layout does nothing | ✅ done | `runLayout()` now `stop()`s the active layout and starts the new preset; superseded layouts no longer clobber state · `c11553a`; verified mid-flight cola→dagre switch |
| 15 | **Toggle to disable layout animations** (`animate: false`) *(added later)* | ❌ todo | Not implemented (0 hits). Planned as a checkbox next to the force toggle; would also speed up the heavy force layouts. |
| 16 | **Speed up physics layouts** with `maxIterations` / `maxSimulationTime` caps *(added later)* | 🟡 partial | Caps exist on cola (4s), euler (6k iters/10s), cise (4s); **not** on the cose-bilkent presets. Blanket caps requested — apply per-preset with tuned values rather than one-size 1000/3000 (too tight for 1,408 nodes). |
| 17 | **Precomputed/preset layouts** (store positions per algorithm; Cytoscape desktop to author) *(added later)* | ❌ todo | No preset-position mechanism exists. Plan: `name: 'preset'` support + `positions` JSON generated offline by a node script; dropdown entries "· saved" use them when present. |
| 18 | **Path-to: top search panel** for picking the link target *(added later)* | 🟡 covered differently | Requested a top-of-graph search panel; shipped instead: while armed, the header search box pulses gold and accepts the target via suggestions/Enter, or tap the map · `543d983`. A dedicated top bar is still possible if this feels hidden. |
| 19 | **Research: offload layouts to a service worker / worker thread** *(added later)* | ❌ todo | Merged into plan §3 P1-2 (Web Worker layout spike) — same mechanism, that row now also covers this research question. |

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
- **P1-2 · Layout threading spike** *(TODO #10b + #19)* — options, in order of pragmatism:
  1. Run layouts on the **visible subgraph only** and keep heavy algorithms off the initial load (already partially true).
  2. `animate: false` for ELK (already) and consider it for cose on graphs > 3k visible nodes (also TODO #15's toggle).
  3. Real off-thread layout: build a headless cytoscape instance inside a Web Worker (service workers can't touch DOM, so a dedicated Worker is the right construct), run the layout there, post positions back and apply via `cy.batch()`. Spike it behind a flag; if it proves stable, make it the default for force layouts.
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
| 2026-09-23 | (this commit) | P1.5 batch: animate toggle, per-preset simulation caps (CAPS table), precomputed layout snapshots (gen-layouts.mjs + saved-positions toggle + '· saved' badge) |
