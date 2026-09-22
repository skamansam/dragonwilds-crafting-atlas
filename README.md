# Dragonwilds ✦ Crafting Atlas

An interactive crafting-tree map of **every item in RuneScape: Dragonwilds**, built from the
[Dragonwilds Wiki](https://dragonwilds.runescape.wiki) — items, stations, recipes, skills, spells
and skill-level unlocks, woven into one navigable dependency graph.

## What it's for

**First and foremost, this answers one question: "What do I need to do to craft this thing
from what I have now?"** Pick any item and the atlas walks the dependency graph backwards
to raw materials, the stations you must build, and the skills you must train — so the gap
between your inventory and your goal is a concrete checklist, not guesswork.

**Secondly, it is a place to browse** — the crafting tree, the item categories, and the
skill trees, as one explorable map of how everything connects.

> **Non-commercial, in perpetuity.** This project carries no ads, no paywall, no sponsorships,
> and no donations tied to feature access — and this will not change. This commitment is what
> makes use of the licensed content below permissible.

## Run it

No build step and no internet needed — the dataset, 1,800+ item icons and the fonts are all
vendored into `site/`:

```bash
cd site
python3 -m http.server 8477
# open http://localhost:8477
```

(Any static file server works; double-clicking `index.html` also works in most browsers.)

## Using the atlas

| Action | Result |
|---|---|
| **Click a node** | Opens its codex panel (top-right): description, stats, all recipes & facilities, skill gates, everything it is used to make |
| **“From nothing” section** | The panel's headline answer: what to **gather** (raw materials, total quantities), what to **build** (stations), what to **train** (skills + levels), and the **critical chain** — the longest run of prerequisite steps. Click any chip to jump |
| **Path to…** (panel button) | Pick a starting item, then tap any target on the map: the shortest material route between them is highlighted with numbered steps in the panel. Esc clears |
| **Shift+Click a node** | Isolates the full crafting *tree* of that item (everything it can become) |
| **Trace inputs** (panel button) | Highlights every transitive ingredient behind the selected item |
| **Type to search** | Fuzzy search across all items; Enter jumps to the top hit |
| **Filter chips** | Show/hide categories (weapons, armour, stations, spells, …) |
| **Dead ends chip** | Reveals the 591 items with no crafting recipes (drops, quest items, resource nodes) |
| **Click a material / product chip in the panel** | Jumps to that item |
| **Esc** | Close panel · clear isolation |
| **F** | Fit the whole graph to view |

The breadcrumb (top right) shows the crafting lineage of your current selection — click any step
to walk back up the chain. The minimap (bottom right) tracks the explored region; click it to jump.

## What's in the data

- **1,951 nodes** — every item, station, resource node and spell page on the wiki
- **3,373 dependency edges** — material → product from all 1,563 unique `{{Recipe}}` templates
  (including tabber recipe variants and build-menu items)
- **37 spells** with their skill, level gate and rune costs (rune → spell edges included)
- **12 skills** with their level-up unlock tables (items unlocked at each level = "Skill gates")
- Icons for ~95% of nodes, downloaded from the wiki; the rest fall back to category glyphs

Data is a **manual snapshot** of the wiki as of the 1.0 update (15 September 2026).
It is refreshed by hand after major game updates — there is no scheduled or automated
re-scraping of the wiki, and the deploy workflow only uploads the existing `site/` folder.

The scraper is rate-limited to roughly one request per second (tune with `RATE_MS`)
and identifies itself with a descriptive User-Agent — see `scripts/wiki-config.mjs`.

## Rebuilding the data

The scraper pipeline (requires internet):

```bash
node scripts/fetch-wiki.mjs        # ~3,650 raw wiki pages → cache/raw/
node scripts/parse-wiki.mjs        # infoboxes + Recipe templates → cache/parsed/dataset.json
node scripts/fetch-icons.mjs       # resolve icon URLs → cache/icons/manifest.json
node scripts/build-data.mjs        # nodes/edges/recipes/spells/skills → site/data.js
node scripts/fetch-icon-files.mjs  # download icons → site/icons/ (then shrink >60 KB files)
node scripts/test-site.mjs         # Playwright smoke test (site must be served on :8477)
```

## Licensing

This repo mixes code, data, and game assets under different licenses:

- **Code** (`scripts/`, site application) — [MIT](LICENSE)
- **Dataset** (`site/data.js`) — [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/),
  a derivative of the Dragonwilds Wiki's text
- **Icons** (`site/icons/`) — Jagex Limited's game assets, used under the
  [Fan Content Policy](https://www.jagex.com/en-GB/legal/fan-content); not open-licensed
- **Fonts** — [SIL OFL 1.1](https://openfontlicense.org/)

Full details in [LICENSE-DATA.md](LICENSE-DATA.md); licensing decisions and outreach are
logged in [COMPLIANCE.md](COMPLIANCE.md).

## Attribution & legal

Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan
Content Policy. This content is not endorsed by or affiliated with Jagex.

This is an unofficial, fan-made, non-commercial reference tool. It is not affiliated with,
sponsored by, or endorsed by Jagex Limited or Weird Gloop. "RuneScape" and
"RuneScape: Dragonwilds" are trademarks of Jagex Limited. Game data and item icons are used
under [Jagex's Fan Content Policy](https://www.jagex.com/en-GB/legal/fan-content); wiki text is
licensed CC BY-NC-SA 3.0 by its authors — see [Licensing](#licensing) below.

### AI-generated disclosure

This codebase was substantially AI-generated (with human direction and review). Because
copyright protection for AI-generated output is limited or uncertain in most jurisdictions,
the project is released fully open-source rather than under an exclusive or closed license.

## Credits

All game data, item names and icons © Jagex — sourced from the community-maintained
[RuneScape: Dragonwilds Wiki](https://dragonwilds.runescape.wiki) (Weird Gloop).
Graph by [Cytoscape.js](https://js.cytoscape.org/) + `cose-bilkent` layout.
Fonts: Cinzel & Alegreya Sans (Google Fonts, OFL).
