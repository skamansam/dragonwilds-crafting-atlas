# Dragonwilds Crafting Atlas — Master Plan & Status

Single source of truth for the two backlogs:

- **`TODO.md`** — product/feature backlog (UX, graph, layouts)
- **`TODO-compliance.md`** — licensing/compliance backlog (Jagex FCP, Weird Gloop, CC BY-NC-SA)

Status legend: ✅ done · 🟡 partial · ❌ todo · ⬜ needs a human (external action)
Evidence = commit hash, test, or verified code path. Update this file whenever a ticket changes state.

Current as of **2026-09-22**, after commit `6bfc84a` (live at http://rudeboy.dev/dragonwilds-crafting-atlas/).

---

## 1. Product backlog status (from `TODO.md`)

| # | Request | Status | Evidence / notes |
|---|---------|--------|------------------|
| 1 | Graph "WAY too dense" | 🟡 partial | Dead-ends toggle (591 leaf items) removed the worst clutter; force toggle + spacing presets + Cola (3.5k×1.8k spread) offer relief. Full density rework still open. |
| 2 | Skill trees as part of the graph | ✅ done | 12 skill hubs with 1,539 gold gate edges · `576cbe0` |
| 3 | Allow unselecting all category chips (blank screen OK) | ✅ done | Tested 1,408 → 71 visible → restore · `test-todo.mjs` |
| 4 | Isolate tree auto-reveals hidden nodes | ✅ done | Isolate turns on every category chip first · `test-todo.mjs` |
| 5 | Layout algorithm selector | ✅ done | 14 options in `#layoutSelect` · `576cbe0` + `29bfe91` |
| 6 | Top-to-bottom tree layout | ✅ done | Dagre TB + ELK layered (DOWN) |
| 7 | Check off owned items, show only reachable | ✅ done | Possessions mode, persisted in localStorage · `576cbe0` |
| 8 | Clickable facilities / items in "How to make" | ✅ done | `data-goto` chips navigate + select the node · `test-todo.mjs` |
| 9 | Isolate walks inputs **and** outputs to leaves | ✅ done | Both-direction BFS added · `29bfe91`; verified Iron Bar → Iron Sword |
| 10 | Layout-running feedback | ✅ done | Header spinner + `Arranging · <algo>` pill with 20s safety timeout · `29bfe91` |
| 10b | **Background/threaded layout so UI doesn't lock** *(added later to TODO.md)* | ❌ todo | See plan §3, item P1-2. Cytoscape layouts run on the main thread; off-thread is possible but non-trivial. |
| 11 | DB counts under title/search; shown counts under layout selector | ✅ done | `#dbcounts` under brand, `#layoutMeta` (nodes/links shown + algorithm) next to select · `29bfe91` |
| 12 | Algorithm name visible; force-directed checkbox; many algorithms | ✅ done | Name shown in `#layoutMeta`; force toggle under select; cola/euler/cise/elk×2/breadthfirst added. Tidytree ≈ ELK `mrtree`; klay is unmaintained — ELK layered is its successor (both noted in §4). |
| 13 | Isolate depth input (default 3, forward + backward) | ✅ done | `#isoDepth` input next to Isolate button; empty = full tree; BFS both directions to the depth; persisted in localStorage · `6bfc84a`; verified 44 / 1,200 / 1,408 nodes at depth 1 / 3 / all |
| 14 | Switching layout during a running force layout does nothing | ✅ done | `runLayout()` now `stop()`s the active layout and starts the new preset; superseded layouts no longer clobber state · `6bfc84a`; verified mid-flight cola→dagre switch |

---

## 2. Compliance backlog status (from `TODO-compliance.md`)

| Ticket | Request | Status | Evidence / notes |
|--------|---------|--------|------------------|
| 01 | Jagex FCP §8.1 attribution line, **verbatim**, in README + app UI | ✅ done | Exact wording in README (Attribution & legal) + app legend (`lg-legal`) + welcome card · `6bfc84a` |
| 02 | Non-affiliation / non-endorsement disclaimer (README + app) | ✅ done | README disclaimer with trademark credit; in-app wording in welcome card + legend · `6bfc84a` |
| 03 | "Non-commercial in perpetuity" statement at top of README | ✅ done | Blockquote directly under the intro · `6bfc84a` |
| 04 | AI-generated disclosure in README | ✅ done | "AI-generated disclosure" section · `6bfc84a` |
| 05 | LICENSE (code) + LICENSE-DATA.md (dataset CC BY-NC-SA, icons under Jagex FCP) | ❌ todo | No LICENSE file of any kind exists. |
| 06 | Weird Gloop attribution: deep links per reused page | 🟡 partial | Verified: items, stations, spells, skills all carry `wiki` deep links. Remaining: audit nodes with wiki-derived data but no link (implicit/variant outputs), confirm README source link. |
| 07 | Scrape via MediaWiki API, not rendered HTML | ✅ done | `fetch-wiki.mjs` uses `api.php` exclusively (line 6). |
| 08 | Rate limiting + descriptive User-Agent with contact | 🟡 partial | Delays exist (120–300 ms ≈ 3–8 req/s) but UA is `DragonwildsCraftingExplorer/1.0` with **no repo/contact**. Slow to ~1 req/s and add repo URL (§3, P1-1). |
| 09 | Document manual-snapshot cadence, no scheduled re-scrape | 🟡 partial | README states the snapshot date (1.0 update, 15 Sep 2026) but doesn't explicitly say "manual, never scheduled". No CI re-scrape exists (deploy workflow only uploads `site/`). Small README addition. |
| 10 | Outreach email to Weird Gloop | ⬜ human | External action; log outcome in COMPLIANCE.md. |
| 11 | Outreach email to Jagex (§6.1.3 "software/application" clause) | ⬜ human | External action; highest-value legal de-risk. |
| 12 | `COMPLIANCE.md` decision log | ❌ todo | File doesn't exist yet. |

---

## 3. Work plan (priority order)

### P0 — broken behavior & the two new TODO items ✅ done 2026-09-22 (`6bfc84a`)

- **P0-1 · Fix silent layout-switch drop** *(TODO #14)* — done: `activeLayout.stop()` + superseded-layout guard in `runLayout()`; verified mid-flight switch.
- **P0-2 · Isolate depth control** *(TODO #13)* — done: `#isoDepth` input (default 3, blank = all), bidirectional depth-limited BFS; verified 44/1,200/1,408.

### P1 — high-value compliance & robustness

- **P1-1 · Scraper etiquette finish** *(compliance 08)* — drop rate to ~1 req/s (`await sleep(1000)`), extend UA to `DragonwildsCraftingExplorer/1.0 (+https://github.com/skamansam/dragonwilds-crafting-atlas; contact: repo issues)`. Document in README's rebuild section. 15 min.
- **P1-2 · Layout threading spike** *(TODO #10b)* — options, in order of pragmatism:
  1. Run layouts on the **visible subgraph only** and keep heavy algorithms off the initial load (already partially true).
  2. `animate: false` for ELK (already) and consider it for cose on graphs > 3k visible nodes.
  3. Real off-thread layout: build a headless cytoscape instance inside a Web Worker, run the layout there, post positions back and apply via `cy.batch()`. Spike it behind a flag; if it proves stable, make it the default for force layouts.
- **P1-3 · Verbatim attribution block** *(compliance 01–04)* — ✅ done `6bfc84a`: all four texts in README + Jagex sentence in app legend/welcome card.

### P2 — licensing & docs

- **P2-1 · LICENSE (MIT) + LICENSE-DATA.md** *(compliance 05)* — code MIT; dataset CC BY-NC-SA 3.0 with link; icons declared Jagex FCP assets, explicitly excluded from the code license. Link all three from a README "Licensing" section.
- **P2-2 · Snapshot wording** *(compliance 09)* — one README sentence: dataset is regenerated **manually** after major game updates; no scheduled or CI scraping exists.
- **P2-3 · COMPLIANCE.md** *(compliance 12)* — dated log seeded with the decisions already made (API-only scraping, snapshot date, license plan); slots for 10/11 outcomes.
- **P2-4 · Deep-link audit** *(compliance 06)* — script a check: every node whose data came from the wiki has a non-empty `wiki` field; exceptions (implicit/variant outputs) listed in COMPLIANCE.md.

### P3 — polish / backlog grooming

- **P3-1 · Density pass** *(TODO #1)* — after P0-1/P0-2, re-evaluate the default view: candidate defaults are Cola (airy) or cose-bilkent with `idealEdgeLength ≥ 130`; consider edge-bundling or hiding skill edges by default on first load.
- **P3-2 · Layout retention** — remember last layout + force toggle in localStorage.
- **P3-3 · Groom TODO.md** — once this plan is adopted, TODO.md items can be pruned/marked to avoid two divergent lists (this file becomes the tracker).
- **P3-4 · Human actions** *(compliance 10, 11)* — send the two outreach emails; log results in COMPLIANCE.md. Cannot be done by the agent.

---

## 4. Research notes

- **Layouts evaluated** (per the cytoscape layouts blog + js-perf matrix): `preset`, `random`, `grid`, `circle`, `concentric`, `breadthfirst`, `dagre`, `cose`, `cose-bilkent`, `cola`, `euler`, `cise`, `elk` (layered/force/mrtree/radial/stress/disco/box), `klay`, `fcose`.
- **Chosen for the dropdown:** cose-bilkent (default), cola, euler, cise, elk-layered, elk-force, breadthfirst, dagre (TB/LR), concentric, circle, grid, random — 14 total.
- **Deliberately skipped:** `klay` (unmaintained since ~2020; ELK layered is its maintained successor), `fcose` (needs the cose-base/layout-base chain we already ship for bilkent — can add later if bilkent proves too slow at full scale; it is faster and animation-friendly), `tidytree` (not a cytoscape extension; ELK `mrtree` is the equivalent tidy-tree).
- **Measured on the full 1,408-node view:** cola 3,529×1,773 (airiest), elk-layered ~2.4k×2.3k, euler needed gravity ≤ 0.05 to avoid collapse (tuned: 1,605×1,303). Keep these numbers as the tuning baseline.

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
| 2026-09-22 | `6bfc84a` | Layout-switch fix, isolate depth control, compliance P0 texts (tickets 01–04) |
