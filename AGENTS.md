# AGENTS.md — working in this repo with an AI agent

The rules that matter when a change is made here by an agent. Where this file and
the human guides overlap, those stay authoritative:

| Read it | It answers |
|---|---|
| [PRODUCT.md](PRODUCT.md) | what the atlas is and is **not** — the non-goals are load-bearing |
| [CONTRIBUTOR.md](CONTRIBUTOR.md) | setup, how the app is wired, repo map, tests, deploy, PR checklist |
| [DESIGN.md](DESIGN.md) | the visual system: tokens, components, motion, voice |
| [CONTRIBUTOR-DATA.md](CONTRIBUTOR-DATA.md) | changing the **dataset** — a different loop, with different licences |
| [TODO.md](TODO.md) · [PLAN.md](PLAN.md) | what is in flight, and the change log |

Read `PRODUCT.md` and the relevant guide **before** writing code. Nothing here
overrides those.

## Verify, then say what actually ran

| Layer | Command | Holds |
|---|---|---|
| Gherkin (vitest + cucumber) | `npx vitest run` | pure logic: slugs, `?query` options, highlight math, character state, the edits merge |
| Playwright e2e | `npx playwright test` | a few real browser flows against the dev server |
| Acceptance suite | `node scripts/test-ui.mjs [section]` | the broad UI suite — run **one section** while iterating, the whole thing before landing |
| Lint | `npm run lint` | `biome check .` — compared against the baseline, never chased |
| Build | `npm run build` | the exact `dist/` GitHub Pages serves |

- **Fix the cause.** Never widen an assertion, skip a scenario, swallow an error,
  or add a lint suppression to make a run green. If the *expected behaviour*
  changed, say so and rewrite the assertion to the new intent.
- **Preserve exit status** when you filter output (`set -o pipefail`, or capture
  `$?` before piping) — a filtered success is not a passing test.
- **Re-run after a repair.** A check that passed before your last edit does not
  cover it.
- **State the real numbers** in the summary: test counts, node/edge counts, timings.
  Unrun checks are reported as unrun, never as passing.

### The lint baseline is pre-existing — don't add to it

`biome.json` is configured tab/double-quoted, but `src/*.js` and `scripts/*.mjs`
ship **2-space, single-quoted**, so `biome check` reports a large standing
baseline (`npx biome check src scripts index.html` as of 2026-10-11: **81 errors,
81 warnings, 120 infos across 58 files**, almost all `useTemplate` plus the
formatter disagreement). **Do not reformat a whole file to chase it, and do not
add a new diagnostic.** Compare your file against `HEAD`:

```bash
git show HEAD:src/app.js > /tmp/head-app.js
npx biome check /tmp/head-app.js | grep '^Found'   # baseline
npx biome check src/app.js | grep '^Found'         # after your change
```

## Naming

- **Say what it is, in full words.** `convertAlphabetToBinary`, not
  `convertAlephtoBin`; `ownedIds`, not `list2`; `hasUnmetGate`, not `check`.
  A reader should not need the body to know what a name means.
- **No single-letter names** for variables or functions — `i`, `n`, `e`, `s` are
  out. The one exception is a single-line lambda whose receiver makes the
  meaning obvious: `nodes.map(node => node.id)`, `byId.get(nodeId)`.
- **Rename the parameters you touch.** Existing code predates these rules (it is
  full of `e`, `s`, `n`); fix them in a function you are editing, but never
  mass-rename across files — that buries the real change.
- Names are British where the game noun is (`armour`), plain English elsewhere.

## Self-documenting code — comments answer *why*

The **what** is the code's job; the **why** is the comment's.

- Write the code so a comment explaining *what it does* would be redundant.
  Prefer a well-named helper over a paragraph.
- Comment the reason, the constraint, the history: why the check is there, why
  the naive version is wrong, which request or phase introduced it. Dates,
  `P3-5`, "user request" — that is house style, not cruft.
- Never leave a comment that restates the line under it.
- Prefer guard clauses and early returns over nesting; keep functions small
  enough to read in one screen.
- Magic numbers get a named `const` (or a comment saying where the number comes
  from — measured, from the wiki, from the spec).

## JSDoc — every function and every module-level variable

JSDoc is **required** for exported functions and for module-level variables that
carry meaning (state, caches, config tables). Add it to whatever you write, and
to a function you are already changing. Existing files predate this rule; convert
them as you touch them, not in a sweep.

```js
/** @typedef {{ id: string, cost?: number, facility?: string }} RecipeStep */

/**
 * Which owned items this node can reach, nearest first. The ordering is stable
 * on purpose — the ledger re-renders on every toggle and must not reshuffle.
 *
 * @param {string} nodeId — the node to walk forward from.
 * @param {Set<string>} ownedIds — the visitor's ledger.
 * @param {number} [depthCap] — stop after this many hops; unset means all.
 * @returns {string[]} reachable node ids, nearest first.
 */
```

- **Real types**, not `{any}`: `{string[]}`, `{Map<string, number>}`,
  `{Set<string>}`, `{() => void}`, nullable as `{string | null}`,
  optional as `[name]`. Say what an opaque value is (`{CytoscapeNode}`).
- **Complex shapes get a `@typedef` at the top of the file** (above the first
  function), so a reader meets the shape before its uses — and reuses it in every
  signature that takes it.
- Document the **contract**, not the implementation: units, ordering guarantees,
  what a return of `null` means, whether the caller owns the result.
- There is no `checkJs`/TypeScript pass over `src/`, so JSDoc is documentation an
  agent and a human both read. That also means it can go stale silently — keep it
  in step in the same edit, never in a follow-up.

## JavaScript

- ES modules, `const` by default, `let` only when reassigned, `===` always. No
  `var`, no implicit globals.
- One concern per module; pure, DOM-free helpers belong in `src/util.js`. UI
  modules that need graph or app state receive it through an `init*()` call from
  `app.js` rather than importing `app.js` back.
- **Globals are a contract.** `public/` data files set `window.DW_*` and the
  `src/` modules mirror themselves; beyond that `app.js` publishes exactly four
  hooks for the tests, the tours and the console — `window.__cy` beside the `cy`
  it wraps, then `Object.assign(window, { selectNode, isolateTree, showEverything })`
  above the boot line. A fifth means a test, a tour or the console needs it: add
  it there deliberately, with a comment on why.
- **Persisted keys are namespaced `dw.`** and, if they follow the active
  character, listed in `STATE_KEYS` (`src/characters.js`). Shareable *view*
  options belong in `OPTION_PARAMS` (`src/routing.js`) — addition there is a
  public URL contract, so it needs a Gherkin case.
- **Never write the shipped data files from the app.** Corrections live in the
  `dw.edits` overlay; baking them in is a build script's job.
- **Escape before `innerHTML`** (`esc()` from `src/util.js`); prefer
  `textContent` (or nodes built with it) for anything a visitor or the wiki
  supplies.
- **Heavy work does not block the UI.** Layouts run with per-preset caps, or off
  the main thread through `layout-worker.js`, or from the saved-position
  snapshots. The map is at the documented budget — 2,052 nodes / 5,316 edges as
  of 2026-10-11 — so measure a real layout before claiming a speed-up, and never
  add a second synchronous full-map pass.
- **Few dependencies, and no runtime CDN.** Vendor into `public/vendor/` only
  after a real discussion; dev-only tooling is fine.

## CSS

- Tokens from `:root` (`src/styles/base.css`) — **never hard-code hex**. Follow
  `DESIGN.md` for surfaces, spacing, type and motion.
- The kind/edge colour vocabulary is **user-facing** (legend, panels, desktop
  exports): use the existing variables, do not redefine a colour locally.
- One partial per concern in `src/styles/`, in the `@import` cascade order
  `src/style.css` declares; adding a partial means adding its import.
- Animate `transform`/`opacity` only, keep to the 150–700 ms budget, and honour
  the global `animate` kill switch and `prefers-reduced-motion`.
- **Touch parity matters.** A control that only exists on row hover is
  unreachable on a tablet — check how a phone/tablet reaches it before shipping
  it (the legend's `.lg-only` is a known offender).
- Match the file you are editing: 2-space indent, single quotes, comments in
  sentence case explaining the *why*.

## HTML

- `index.html` is the whole DOM, and the app, tests, tours and acceptance suite
  query it by **id and class** — keep those stable; a rename is a breaking change.
- Real `<button>` elements, a visible `:focus-visible`, `title` **and**
  `aria-label` on icon-only buttons, and Esc closes the top-most surface.
- The visitor-facing data-fix walkthrough is `#dataGuideModal` — plain language,
  naming the controls the app actually renders; `CONTRIBUTOR-DATA.md` is the
  developer's copy of the same loop. Keep the two in step, and note that the
  hand-over is the **Data fix** issue form in `.github/ISSUE_TEMPLATE/`.
- Classic `<script>` tags for the `public/` globals must stay ahead of the
  `type="module"` entry — modules run after the document parses and import those
  globals at load time.
- No inline event handlers or inline styles; the state lives in the app, the
  markup carries semantics.
- Progressive enhancement with a working fallback (native popover, anchor
  positioning) — no polyfill pile-ups.

## Microcopy & accessibility

- In-world, spare, second person; error and empty states say what to do next.
- Body copy uses `--ink`/`--muted`; `--faint` is the readability floor. Em-dashes
  are part of the voice — don't let them saturate new copy.

## Before you land it

1. **Docs in step** — if the code and `DESIGN.md` disagree, the code wins and you
   update `DESIGN.md` in the same change. Same for `README.md`/`CONTRIBUTOR.md`
   when behaviour or wiring changes.
2. **Changelog row in `PLAN.md`** (§6), in the existing form: date · files/areas ·
   what changed · the measured numbers · anything deliberately left alone.
3. **`TODO.md`** — tick a box only when the work is actually done, and say what
   remains if it is partial.
4. **Commit message explains the why**, not the what. Small commits.
5. **Report honestly**: what passed, what failed, what you could not run.
