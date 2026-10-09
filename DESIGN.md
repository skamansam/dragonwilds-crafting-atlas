# DESIGN.md — Dragonwilds ✦ Crafting Atlas

The durable visual system of the site. Everything here is harvested from the
shipped code (`src/style.css`, `index.html`) — when adding UI, follow this
file; when this file and the code disagree, the code wins and this file should
be updated. Mode: **Operate** — visitors complete tasks (find items, explore
recipes, plan what to craft); scanability and consistency outrank expression.

## World & point of view

**"Dark vault-stone canvas, runic gold accents, carved Cinzel display."** The
atlas reads as an in-game tome: near-black blue-stone surfaces, rune-gold
illumination, engraved serif display type. It is deliberately *not* a generic
dashboard — warmth and texture come from the gold/ink duotone, not from
photographic assets (the only imagery is item icon PNGs from the wiki).

- Identity anchors: the ✦ rune (favicon, veil, welcome, pathbar), Cinzel
  small-caps-style display headings, gold focus/glow language on interactive
  things.
- The signature glow (`text-shadow`/`box-shadow` gold halos) is a **deliberate
  brand choice**, not an accident — keep it on identity elements only (titles,
  armed search, the pathbar), never on body copy or dense chrome.

## Color tokens (`:root` in `src/styles/base.css`, imported by `src/style.css` — never hard-code hex in new CSS)

| Token | Value | Role |
|---|---|---|
| `--bg0` | `#0a0c11` | page canvas |
| `--bg1` | `#10131b` | inputs, raised fields |
| `--bg2` / `--bg3` | `#161a25` / `#1d2230` | cards, panel headers |
| `--ink` | `#e9e4d6` | primary text (warm parchment white) |
| `--muted` | `#a49d8c` | secondary text |
| `--faint` | `#6d6a5e` | tertiary/meta text — never below this for readable text |
| `--gold` / `--gold-bright` | `#e2b95c` / `#f7dd9a` | identity accent, CTAs, active states |
| `--gold-dim` / `--gold-faint` | `rgba(226,185,92,.35 / .14)` | gold borders / gold washes |
| `--teal --ember --violet --leaf --steel` | `#58c9b9 #e0704a #a58cf0 #8fbf6a #7fa8c9` | semantic sparks (skill/ember/quest/leaf/steel accents) |
| `--line` | `rgba(226,185,92,.16)` | hairline borders (gold-tinted, not gray) |
| `--panel` | `rgba(16,19,27,.92)` | floating surfaces (node panel, settings) |

Layered surfaces go `--bg0 → bg1 → bg2 → bg3`; floating chrome uses translucent
`--panel` + `backdrop-filter: blur(6–10px)`. Borders are 1px `--line` or
`--gold-dim` (gold border = "this is armed/active").

### Kind palette (data-driven node colors, `app.js` `kindColor`)

weapon `#c96a4a` · armour `#7fa8c9` · tool `#c9a86a` · station `#58c9b9` ·
ammo `#b0b0b0` · trinket `#a58cf0` · food `#8fbf6a` · potion `#e0709a` ·
drink `#6ab0c9` · material `#e2b95c` · resource `#9a8f77` · spell `#6ea8ff` ·
skill `#f7dd9a` · implicit `#6d6a5e` · other `#8a8577` · region `#7fc9a6` ·
quest `#d9a13f` (gold octagon, `❖`) · mount `#c9a0e0` (violet, `⚑`).
Edge kinds: recipe = ink (default), skill gates `--gold` (hidden by default),
region links `rgba(140,200,170,.30)` (hidden by default), quest links
`rgba(217,161,63,.36)` gold — region → quest → reward — and their mount spokes
`rgba(201,160,224,.40)` violet, **both on by default** (the quest layer is the
map's spine, not a side-layer) under one legend row, LINKS → Quest links. These
colors are user-facing vocabulary — the legend, panels and exports all repeat
them; do not redefine them locally.

## Typography

- **Display**: `'Cinzel', 'Times New Roman', serif` — headings, brand, stats,
  runic moments. Uppercase with wide tracking (`letter-spacing: .04–.08em`),
  weight 700–900.
- **Body/UI**: `'Alegreya Sans', 'Segoe UI', sans-serif` — everything else.
  Base 15px/1.45; secondary 12–13px; meta 10–11px (the floor for readable text).
- Hierarchy is driven by size + color (`ink → muted → faint`) rather than
  weight alone; bold is reserved for labels, buttons and the gold display face.
- Self-hosted via `public/fonts.css` (Google Fonts subsets, served verbatim from
  `public/fonts/`); no external font CDN at runtime beyond that file.

## Spacing, shape, elevation

- Scale is 2-based in practice: 2 · 4 · 5 · 8 · 12 · 14 · 18 · 22 · 34px.
  Panel interiors `12–14px`; dense rows `1–6px`; section gaps `14–18px`.
- `--radius: 10px` for panels/cards; 8px for inputs/buttons; 999px for pills
  (pathbar, arranging pill, badges); 3–6px for micro-elements.
- `--shadow: 0 12px 40px rgba(0,0,0,.55), 0 2px 10px rgba(0,0,0,.4)` for
  floating surfaces. Choose per element: **defined edge** (1px border) *or*
  diffuse elevation — hairline border + giant blur together reads muddy.
- Motion: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, 150–700ms; ambient
  pulses (pathbar glow, arming search) at 1.2–1.6s ease-in-out. Animate
  `transform`/`opacity` only — never `width`/`height`/layout properties
  (progress bars use `scaleX`).

## Components (where to copy from)

| Pattern | Reference |
|---|---|
| Overlay panel (top layer, anchored) | `#settingsPanel` — native `popover="auto"`, anchor-positioned to `--settings-btn`, fixed-coords fallback in JS |
| Header row layout | `header` flex: brand ‖ `.header-center` (search + meta inline) ‖ `.header-right` cluster |
| Status pill | `#layoutInd` — stage overlay, top-center, gold pill + `scaleX` progress bar |
| Control rows in panels | `.s-title/.s-group/.s-note/.s-save` + `.s-btn` (gold = primary, danger = destructive) |
| Legend rows (check/toggle/swatch/action) | `.lg-row` + `.lg-check/.lg-swatch/.lg-only` |
| Wide annotation tables | docs/checklists generators — prettier-aligned `\|` tables, `x` marks, Notes prose |
| Toasts (with optional Undo) | `toastWithUndo` / `.toast-undo` — 5s life, gold border button |
| Complexity callout (help + welcome) | `.h-note` / `#welcome .w-note` — gold-wash box, gold display label, the "it is necessarily complicated itself" note (same copy in both places) |
| Owned emphasis (codex) | `#panel.owned` — gold border + gold inset wash when the selected item is in the ledger; the header's ☆/★ is the toggle |
| Next level's unlock (skill hub) | `.p-section.next-unlock` — teal-wash box above the full ladder, `.nu-lv` names the level and your current one |
| Requirement status (skill gates) | `.unlock-row.met` + `.gate-ok` (teal ✓) / `.gate-miss` (ember "needs N — you have M"); `.recipe-unlock.needs` for an unowned unlock item |
| Story layer in the codex (region / quest / mount) | `renderPanelBody`'s early branches — a region lists "What you find here" + "Quests here", a quest leads with **Where to start** then jumpable reward rows (`❖` rune pin, no ☆), a mount gets `.mount-card` with "How to get it" + requirements. All rows are `data-goto` jumps, same as found-in rows |

Buttons: `.s-btn` vocabulary — default (quiet, `--line` border), `.gold`
(primary), `.danger` (red hover). Icon-only buttons carry `title` +
`aria-label`.

## Voice & microcopy

- In-world, spare, second person: "Attuning the Atlas", "Showing only weapons
  — click “only” again to bring the rest back".
- Toasts state the effect and, when a toggle changed something destructive,
  offer **Undo** in the toast itself.
- British spellings in game nouns (armour), plain English elsewhere.
- Em-dashes are part of the voice; don't let them saturate new copy.

## Accessibility & platform notes

- WCAG-conscious text colors: the faint tier (`#6d6a5e` on `--bg0`) is the
  floor; body copy uses `--ink`/`--muted`.
- Keyboard: Esc closes panel/popovers and cancels path/isolation; focus styles
  come from `:focus-visible` gold borders. Buttons are real `<button>`s.
- The settings popover uses the native Popover API (top layer, light dismiss)
  with a fixed-position fallback where unsupported; anchor positioning
  (`position-area`, flip fallbacks) progressively overrides the fallback.
- Reduced motion / performance: layouts animate ≤700ms with a global kill
  switch (`animate` toggle); the arranging bar and pulses are the only ambient
  motion. Keep new motion within those budgets.
- Canvas-first app: Cytoscape owns the graph; DOM chrome must never overlay
  the stage center except the welcome card and the arranging pill.

## Anti-goals (things this design deliberately rejects)

- Gray-on-gray dashboard chrome: hairlines are gold-tinted, not neutral gray.
- Gradient text, neon multicolor accents, glassmorphism stacks: glow is for the
  gold identity only.
- Cross-fading layout properties: no width/height/margin transitions.
- Icon fonts: emoji/unicode runes (✦ ⌖ ⚙ ◆) carry the pictogram load.
