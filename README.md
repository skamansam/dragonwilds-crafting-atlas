# Dragonwilds ✦ Crafting Atlas

An interactive crafting-tree map of **every item in RuneScape: Dragonwilds**, built from the
[Dragonwilds Wiki](https://dragonwilds.runescape.wiki) — items, stations, recipes, skills, spells
and skill-level unlocks, woven into one navigable dependency graph.

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

Data is a snapshot of the wiki as of the 1.0 update (15 September 2026).

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
