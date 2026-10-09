# CONTRIBUTOR.md — contributing to the code

A guide to changing the **code** of the Dragonwilds ✦ Crafting Atlas: the front
end in `src/` + `public/`, the pipeline in `scripts/`, and the three test layers.

Contributing **data** (items, recipes, locations, icons, layouts) is a different
loop with its own rules and licences — see [CONTRIBUTOR-DATA.md](CONTRIBUTOR-DATA.md).

## Ground rules

Read [PRODUCT.md](PRODUCT.md) first; the non-goals there are load-bearing:

- **Static forever.** No backend, no accounts, no database, no analytics, no
  server-side anything. GitHub Pages plus build scripts only. A change that
  needs a server is out of scope, however nice it is.
- **Static output, built once.** No backend, no accounts, no database, no
  analytics, no server-side anything. `vite build` bundles and minifies `src/`
  and copies `public/` verbatim into a plain static `dist/` that GitHub Pages
  serves — there is no bundler *in* the deploy path and nothing runs on a
  server. A change that needs one is out of scope, however nice it is.
- **Map, not wiki.** Link to the wiki; don't mirror it.
- **Non-commercial, in perpetuity.** No ads, paywalls, sponsorships or
  donations tied to features. This is also what makes the licensed content
  permissible — see [LICENSE-DATA.md](LICENSE-DATA.md).
- **Licences are per-content-type.** Code MIT · dataset CC BY-NC-SA 3.0 ·
  icons Jagex Fan Content Policy (all rights reserved) · fonts SIL OFL 1.1.
  Never re-license someone else's layer as MIT.
- **AI-generated disclosure.** The codebase is substantially AI-generated with
  human direction and review (see README). Keep that honest: review what you
  land, and don't paste in code you can't explain.

## Set up

```bash
git clone https://github.com/skamansam/dragonwilds-crafting-atlas
cd dragonwilds-crafting-atlas
npm install          # vite, vitest(+cucumber), playwright — dev tooling only
```

Any current Node LTS works (built with Node 24). Run `npm run dev` and edit;
nothing is compiled by hand.

### Run the site

```bash
npm run dev            # Vite dev server → http://localhost:5173
```

That is the normal way to work: Vite serves the `src/` modules with HMR, mounts
`public/` at the URL root, and is the same server the test suites drive. To look
at exactly what ships, build and serve the artifact:

```bash
npm run build && npm run preview   # bundles to dist/, then serves dist/
```

Two things to know:

- **Opening `index.html` from disk no longer works.** It references
  `/src/main.js`, `/data.js`, `/vendor/…` from the URL root, which only exist
  behind a server (dev) or in `dist/` (build). Serve `dist/` with any static
  server if you want a dumb one.
- **Routing is still hash-based** (`#/iron_sword`), see `src/routing.js`: the
  fragment never reaches the server, so one implementation covers the dev
  server, `dist/` on Pages and a local preview. `?query` options work for the
  same reason.

`node scripts/test-ui.mjs --serve-only` boots the same dev server on `:8491`
for an external runner.

## Repo map

| Path | What it is |
|---|---|
| `index.html` (repo root) | The whole DOM: header, panels, modals, the `vendor/*` + data `<script>` block, the `src/main.js` module entry |
| `src/main.js` | The module entry — imports `style.css` and `app.js` |
| `public/` | Copied verbatim into `dist/`: `vendor/`, `icons/`, `fonts/`, the generated data files, `layout-worker.js` |
| `dist/` | `vite build` output — gitignored, and what the Pages workflow uploads |
| `src/app.js` | The application core — Cytoscape graph, layout engine, legends, panels, isolation, boot (~3.1k lines; the tightly-coupled UI/state code that still lives in one file) |
| `src/util.js` | Pure helpers — HTML escaping, layout-duration/edit-value formatting, fuzzy search scoring |
| `src/edits.js` | The in-app data-edit overlay (`dw.edits`): node patches, added/hidden nodes, custom relationships, and the diff against the bundle |
| `src/highlight.js` | The requires/enables highlight state machine (levels, depth, step-back, restore); app.js injects `cy`, `nodeById`, the isolation getters and `toast` via `initHighlight()` |
| `src/plans.js` | Plans — "from nothing", "from what you own", the waypoint checklist and its progress records (`initPlans()`) |
| `src/path.js` | Path-to queries: arming, the shortest-route walk and the step list (`initPath()`) |
| `src/minimap.js` | The bottom-right minimap canvas (`initMinimap()`) |
| `src/characters-ui.js` | The character UI (⚉ header control, startup prompt, skill-level editor); app.js injects `cy` + `toast` via `initCharactersUI()` |
| `src/style.css` | The stylesheet **entry** — `@import`s the `src/styles/*` partials in cascade order (follow [DESIGN.md](DESIGN.md)) |
| `src/styles/` | The design system split by section: `base`, `search`, `controls`, `legend`, `panel`, `overlays`, `minimap` |
| `src/routing.js` | Pure rules for hash slugs and `?query` graph options (also mirrored in `tests/lib/routing.ts`) |
| `src/characters.js` | Per-character graph state (`dw.characters`) and the switch/snapshot logic |
| `src/tours.js` | Guided tours (driver.js) |
| `public/layout-worker.js` | Web Worker for off-main-thread layout |
| `public/data.js` `public/data.json` | The shipped dataset (see CONTRIBUTOR-DATA.md) |
| `public/found-in.js` | Region / gather-method annotations (`window.DW_FOUND_IN`) |
| `public/quests.js` | The quest layer (`window.DW_QUESTS`) — quest type, region, "Where to start" and reward items |
| `public/mounts.js` | The mount layer (`window.DW_MOUNTS`) — base type, unlocking quests, acquisition line and lore |
| `public/layouts/` | Precomputed position snapshots (`manifest.js` bundled, `curated.js` shared) |
| `public/vendor/` | Vendored Cytoscape + layout extensions, driver.js, d3 bits — no CDN at runtime |
| `scripts/` | The data pipeline, audits and the acceptance suite (CONTRIBUTOR-DATA.md) |
| `tests/features/`, `tests/e2e/` | Gherkin (vitest) and Playwright e2e layers |
| `PLAN.md` | The plan of record **and its changelog** — every landed change gets a journal row |
| `DESIGN.md`, `PRODUCT.md`, `COMPLIANCE.md`, `LICENSE-DATA.md` | The durable docs this project keeps in step with the code |

## How the app is wired

Deliberately two halves:

- **`src/` is real ES modules**, bundled and minified by Vite. `src/main.js` is
the entry (`index.html` loads it with `type="module"`); it imports `style.css`
and `app.js`, and `app.js` imports `routing.js` / `characters.js` / `tours.js`
plus the smaller extracted modules `util.js`, `edits.js`, `characters-ui.js`,
`highlight.js`, `plans.js`, `path.js` and `minimap.js` — the four UI-side
modules get what they need (the `cy` instance, `nodeById`, `toast`, live state
through getter/setter pairs) through an `init*()` call from `app.js`, so
dependency order is expressed as imports rather than `<script>` position.
`style.css` is likewise just an entry — it `@import`s the `src/styles/*`
partials in cascade order, and Vite inlines them into one built stylesheet.
Adding an app file or a CSS partial means adding an `import` (or `@import`).
- **`public/` is copied verbatim** into the build: `vendor/` (classic IIFE
bundles that self-register on `window`), `icons/`, `fonts/`, `data.js`,
`data.json`, `found-in.js`, `layouts/*` and `layout-worker.js` (whose
`importScripts('vendor/…')` paths depend on sitting beside `vendor/`). None of it
is transformed — which is exactly why `data.js` and friends still set globals
from a `<script>` tag in `index.html` instead of being imported.

Consequences worth knowing:

- **The module entry is deferred.** Classic scripts run while the document
  parses; module scripts run after. So `window.cytoscape`, `window.d3`,
  `window.driver`, `window.DW_DATA`, `window.DW_LAYOUTS`, `window.DW_CURATED`,
  `window.DW_FOUND_IN`, `window.DW_QUESTS` and `window.DW_MOUNTS` all exist
  before `src/main.js` executes. If you add a vendor bundle that a module needs
  at import time, give it a `<script>` in `index.html` ahead of the module.
- **The data contracts are globals**: `window.DW_DATA`, `window.DW_LAYOUTS`,
  `window.DW_CURATED`, `window.DW_FOUND_IN`, `window.DW_QUESTS`,
  `window.DW_MOUNTS` (set by `public/` files) and `window.DW_ROUTING`,
  `window.DW_CHARACTERS`, `window.DW_TOURS` (set by the
  `src/` modules, which mirror themselves onto `window` for the harness and the
  console), while `found-in.js` / `quests.js` / `mounts.js` are **overlays**: the
  app synthesizes their region hubs and quest nodes at boot and leaves
  `data.json` (recipes, plans, paths, counts) untouched. A missing overlay file
  is not an error — the layer simply does not appear. The browser e2e tests poke `window.__cy`, `window.selectNode`,
  `window.isolateTree` and `window.showEverything`; a module has no implicit
  globals, so `src/app.js` re-publishes those four explicitly at the bottom of
  the file. Anything else a test, a tour or the console calls by name has to be
  added there too.
- **Everything persisted is namespaced `dw.`** (`dw.edits`, `dw.owned`,
  `dw.layout`, `dw.characters`, `dw.highlight`, …). The Playwright config relies
  on that prefix to isolate tests. A new persisted key must also be
  (a) added to `STATE_KEYS` in `src/characters.js` if it should follow the
  active character, and (b) kept out of `syncUrl()`'s option list unless it is
  genuinely a shareable view option (those live in `OPTION_PARAMS`,
  `src/routing.js`).
- **Never touch the shipped data files from the app.** Corrections live in the
  `dw.edits` overlay; baking them in is a separate script (CONTRIBUTOR-DATA.md).

## Conventions

Match the file you are editing; the pre-existing style wins over a formatter
argument you are not prepared to have across ~15 files.

- `src/*.js` and `scripts/*.mjs` are written **2-space indent, single quotes,
  em-dash-heavy comments in sentence case**. Comments explain *why*, with the
  history (dates, "P3-5", "user request") where it matters — that is the house
  style, not cruft.
- `tests/**` and config files (`vite.config.js`, `playwright.config.ts`) are
  **tab-indented, double-quoted** TypeScript, matching `biome.json`.
- `biome.json` is configured tab/double, so `npm run lint` reports a large
  **pre-existing** diagnostic baseline in `src/` (as of this commit: `app.js`
  alone 7 errors / 20 warnings / 40 infos, almost all `useTemplate` and the
  formatter disagreement). **Do not add new diagnostics, and do not reformat a
  whole file to chase them.** Check your change against `git show HEAD:<file>`:

  ```bash
  git show HEAD:src/app.js > /tmp/head-app.js && npx biome check /tmp/head-app.js | grep '^Found'
  npx biome check src/app.js | grep '^Found'
  ```
- **Few dependencies.** Vendor a library into `public/vendor/` (no runtime CDN)
  and only after a real discussion — the app's whole value proposition is that
  it opens offline from a folder. New dev-only tooling is fine.
- **`public/vendor/driver.js` carries one load-bearing detail.** The tour
  overlay's dim-layer hole is the only SVG `<path>` the atlas ever writes, and
  its rect is eased between the previous and the newly highlighted element's
  rects. Keep that animation's `x<400` gate (in the minified `W`/`P` helpers):
  it is what holds the eased ratio at λ < 1 so the interpolated rect always
  stays *between* the two real rects — both non-negative by spec. Without the
  gate a frame delayed past the window (a layout is running during several tour
  steps) eases past the target, reaches a negative width and writes `h--<n>`
  into the path, which Chrome rejects as `<path> attribute d: Expected number`.
  The `tours` section of `scripts/test-ui.mjs` records every path write and
  fails on one that is invalid, so re-vendoring without the gate fails loudly
  rather than glitching quietly.
- **UI**: follow DESIGN.md — tokens from `:root`, never hard-coded hex; the
  colour vocabulary (kind colours, edge kinds) is user-facing and repeated in
  the legend, panels and exports, so don't redefine it locally; animate only
  `transform`/`opacity`; keep to the performance budget (~2k nodes / ~4k edges,
  heavy layout work in the worker); icon-only buttons carry `title` +
  `aria-label`; progressive enhancement with a working fallback, no polyfill
  pile-ups.
- **Microcopy**: in-world, spare, second person, British spellings in game
  nouns. Error and empty states say what to do next.
- **Accessibility**: real `<button>`s, `:focus-visible` visible, Esc closes the
  top-most surface, the faint colour tier is the readability floor.

## Making a change

1. **Branch** off `main`; keep commits small and explain the *why* in the
   message (the log is the project's memory).
2. **Change the code** — and the docs it contradicts. `DESIGN.md`/`PRODUCT.md`
   are only useful if they stay true; if the code and `DESIGN.md` disagree, the
   code wins and you update `DESIGN.md` in the same change.
3. **Cover it.** A behaviour change needs a check in the cheapest layer that can
   hold it (below). UI work should add or extend a `scripts/test-ui.mjs` section.
4. **Journal it.** Add a row to the changelog table in `PLAN.md`, in the
   existing form: date · files/areas · what changed · the measured numbers
   (test counts, node counts) · anything you deliberately left alone.
5. **Run the three layers** and the linter, then state the real results.

## Tests

| Layer | Command | Use it for |
|---|---|---|
| Gherkin (vitest + cucumber) | `npx vitest run` | Pure logic: highlight/frontier math, character state, routing slugs, the `?query` option parser, and the data-edit merge (`tests/features/edits-apply.*` driving `scripts/apply-edits-core.mjs`) |
| Playwright e2e | `npx playwright test` | A few real browser flows, booted by the config's `webServer` (`npx vite --port 8491`): boot, search → codex, isolate, requires-growth, layout completion, persisted settings, `?tour=` and `#/` deep links, `?iso=` on load, console cleanliness |
| Acceptance suite | `node scripts/test-ui.mjs [section]` | The broad UI suite (~203 checks across `smoke`/`panel`/`undo`/`layouts`/`tours`/`route`/`options`/`quests`/`edits`/`characters`). It boots the `src/` sources through the same Vite dev server (or `--url=` for a deployed/built site); run one section while iterating, the whole thing before you land |
| Lint | `npm run lint` | `biome check .` — compare against the baseline, don't chase it |

All three layers are plain Node + a browser; nothing is compiled. When a check
fails, fix the cause — never widen an assertion, skip a scenario, or add a lint
suppression to make a run green. If the *expected behaviour* is what changed,
say so in the commit and rewrite the assertion to the new intent.

## Deploy

`.github/workflows/deploy.yml` runs `npm install` + `npm run build` and uploads
**`dist/`** to GitHub Pages on every push to `main` (and on manual dispatch).
The base path comes from `actions/configure-pages` (passed through as
`PAGES_BASE`), so renaming the repo — or moving to a user page — needs no config
change. A post-deploy job then smoke-tests the live URL with
`node scripts/test-ui.mjs --url=… smoke`: CI is the only place the minified,
base-prefixed bundle is exercised end to end, so the suite runs against sources
locally and against the build there.

`dist/` is gitignored and rebuilt on every run, and `cache/`,
`playwright-report/` and `test-results/` are gitignored too, so a deploy never
ships scraper intermediates or test artifacts.

## Pull-request checklist

- [ ] The change fits the non-goals in PRODUCT.md (static, no server, no deps)
- [ ] The app still boots from `npm run dev` **and** from a built `dist/` (the
      deploy only ever sees the build), with any new file wired in correctly —
      an `import` in `src/`, or a `<script>` before the module for a `public/`
      asset
- [ ] New persisted state is `dw.`-prefixed, deliberately per-character or not,
      and documented if it is a shareable view option
- [ ] UI matches DESIGN.md tokens/patterns; icon-only controls have `title` +
      `aria-label`; motion obeys the budget
- [ ] A check covers the new behaviour, in the cheapest layer that can hold it
- [ ] `npx vitest run`, `npx playwright test`, `node scripts/test-ui.mjs` pass —
      or the failures are reported honestly
- [ ] Biome reports no **new** diagnostics
- [ ] Docs updated: README (user-facing), DESIGN.md (visual), PLAN.md journal
      (always), CONTRIBUTOR(-DATA).md if the workflow changed
- [ ] Licences respected: no icon/asset/font added outside LICENSE-DATA.md
