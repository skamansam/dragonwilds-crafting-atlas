# CONTRIBUTOR.md — contributing to the code

A guide to changing the **code** of the Dragonwilds ✦ Crafting Atlas: the static
site in `site/`, the pipeline in `scripts/`, and the three test layers.

Contributing **data** (items, recipes, locations, icons, layouts) is a different
loop with its own rules and licences — see [CONTRIBUTOR-DATA.md](CONTRIBUTOR-DATA.md).

## Ground rules

Read [PRODUCT.md](PRODUCT.md) first; the non-goals there are load-bearing:

- **Static forever.** No backend, no accounts, no database, no analytics, no
  server-side anything. GitHub Pages plus build scripts only. A change that
  needs a server is out of scope, however nice it is.
- **No build step at runtime.** `site/` is shipped as-is — classic `<script>`
  tags, vendored libraries, vendored fonts, no bundler in the deploy path.
  Vite exists only as a dev server and a copy-into-`dist/` convenience.
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

Any current Node LTS works (built with Node 24). There is no build to run: the
shipped `site/` folder is the application.

### Run the site

```bash
cd site && python3 -m http.server 8477    # open http://localhost:8477
```

Double-clicking `site/index.html` also works in most browsers, and a shared link
or `file://` works because routing is **hash-based** (`#/iron_sword`) — the page
loads `data.js`/`app.js` by relative path, so a real path like `/iron_sword`
would break; see `site/routing.js`.

`npm run dev` (Vite) is the intended dev server but is **currently broken**:
`vite.config.js` sets `appType: "static"`, which is not a valid Vite value
(only `spa`/`mpa`/`custom` get the HTML fallback middleware), so the dev server
answers `404` for both `/` and `/index.html` while serving `/app.js` fine. The
one-line fix is `appType: "spa"`; until then use the static server above, or
`node scripts/test-ui.mjs --serve-only` (serves `site/` on `:8491`).

## Repo map

| Path | What it is |
|---|---|
| `site/index.html` | The whole DOM: header, panels, modals, the bottom `vendor/*` script block |
| `site/app.js` | The application — Cytoscape graph, panels, plans, paths, highlight, isolation, in-app data editing (~4k lines) |
| `site/style.css` | The design system in practice — follow [DESIGN.md](DESIGN.md) |
| `site/routing.js` | Pure rules for hash slugs and `?query` graph options (also mirrored in `tests/lib/routing.ts`) |
| `site/characters.js` | Per-character graph state (`dw.characters`) and the switch/snapshot logic |
| `site/tours.js` | Guided tours (driver.js) |
| `site/layout-worker.js` | Web Worker for off-main-thread layout |
| `site/data.js` `site/data.json` | The shipped dataset (see CONTRIBUTOR-DATA.md) |
| `site/found-in.js` | Region / gather-method annotations |
| `site/layouts/` | Precomputed position snapshots (`manifest.js` bundled, `curated.js` shared) |
| `site/vendor/` | Vendored Cytoscape + layout extensions, driver.js, d3 bits — no CDN at runtime |
| `scripts/` | The data pipeline, audits and the acceptance suite (CONTRIBUTOR-DATA.md) |
| `tests/features/`, `tests/e2e/` | Gherkin (vitest) and Playwright e2e layers |
| `PLAN.md` | The plan of record **and its changelog** — every landed change gets a journal row |
| `DESIGN.md`, `PRODUCT.md`, `COMPLIANCE.md`, `LICENSE-DATA.md` | The durable docs this project keeps in step with the code |

## How the app is wired

`site/` is deliberately **classic scripts, not ES modules**. Evidence: the
`<script src>` list at the bottom of `index.html` — no `type="module"`, and
Vite passes classic scripts through untransformed.

That means:

- **Order matters.** Each file reads globals set by the ones before it.
  `data.js` → `layouts/*` → `found-in.js` → `routing.js` → `characters.js` →
  `vendor/driver.js` → `tours.js` → `app.js`. Adding a file means adding a
  `<script>` in the right place, not an `import`.
- **The contracts are globals**: `window.DW_DATA`, `window.DW_LAYOUTS`,
  `window.DW_FOUND_IN`, `window.DW_ROUTING`, `window.DW_CHARACTERS`. The browser
  e2e tests poke `window.__cy`, `window.selectNode`, `window.isolateTree`, so
  those stay on `window`.
- **Everything persisted is namespaced `dw.`** (`dw.edits`, `dw.owned`,
  `dw.layout`, `dw.characters`, `dw.highlight`, …). The Playwright config relies
  on that prefix to isolate tests. A new persisted key must also be
  (a) added to `STATE_KEYS` in `site/characters.js` if it should follow the
  active character, and (b) kept out of `syncUrl()`'s option list unless it is
  genuinely a shareable view option (those live in `OPTION_PARAMS`,
  `site/routing.js`).
- **Never touch the shipped data files from the app.** Corrections live in the
  `dw.edits` overlay; baking them in is a separate script (CONTRIBUTOR-DATA.md).

## Conventions

Match the file you are editing; the pre-existing style wins over a formatter
argument you are not prepared to have across ~15 files.

- `site/*.js` and `scripts/*.mjs` are written **2-space indent, single quotes,
  em-dash-heavy comments in sentence case**. Comments explain *why*, with the
  history (dates, "P3-5", "user request") where it matters — that is the house
  style, not cruft.
- `tests/**` and config files (`vite.config.js`, `playwright.config.ts`) are
  **tab-indented, double-quoted** TypeScript, matching `biome.json`.
- `biome.json` is configured tab/double, so `npm run lint` reports a large
  **pre-existing** diagnostic baseline in `site/` (as of this commit: `app.js`
  alone 7 errors / 20 warnings / 40 infos, almost all `useTemplate` and the
  formatter disagreement). **Do not add new diagnostics, and do not reformat a
  whole file to chase them.** Check your change against `git show HEAD:<file>`:

  ```bash
  git show HEAD:site/app.js > /tmp/head-app.js && npx biome check /tmp/head-app.js | grep '^Found'
  npx biome check site/app.js | grep '^Found'
  ```
- **Few dependencies.** Vendor a library into `site/vendor/` (no runtime CDN)
  and only after a real discussion — the app's whole value proposition is that
  it opens offline from a folder. New dev-only tooling is fine.
- **`site/vendor/driver.js` carries one load-bearing detail.** The tour
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
| Playwright e2e | `npx playwright test` | A few real browser flows, served by the config's `webServer` (`test-ui.mjs --serve-only`): boot, search → codex, isolate, requires-growth, layout completion, persisted settings, `?tour=` and `#/` deep links, `?iso=` on load, console cleanliness |
| Acceptance suite | `node scripts/test-ui.mjs [section]` | The broad UI suite (~171 checks across `smoke`/`panel`/`undo`/`layouts`/`tours`/`route`/`options`/`edits`/`characters`). It serves `site/` itself; run one section while iterating, the whole thing before you land |
| Lint | `npm run lint` | `biome check .` — compare against the baseline, don't chase it |

All three layers are plain Node + a browser; nothing is compiled. When a check
fails, fix the cause — never widen an assertion, skip a scenario, or add a lint
suppression to make a run green. If the *expected behaviour* is what changed,
say so in the commit and rewrite the assertion to the new intent.

## Deploy

`.github/workflows/deploy.yml` uploads the tracked `site/` folder to GitHub
Pages on every push to `main` (and on manual dispatch). There is no build step
in CI — which is why `site/` must always be complete and working on its own.
`cache/`, `playwright-report/` and `test-results/` are gitignored, so a deploy
never ships scraper intermediates or test artifacts.

## Pull-request checklist

- [ ] The change fits the non-goals in PRODUCT.md (static, no server, no deps)
- [ ] `site/` still works opened directly from disk, with the new `<script>` in
      the right order if I added a file
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
