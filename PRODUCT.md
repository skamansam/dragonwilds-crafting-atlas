# PRODUCT.md — Dragonwilds ✦ Crafting Atlas

## What this is

An interactive crafting-dependency map of **RuneScape: Dragonwilds** — every
item, station and recipe woven into one navigable graph, with the locations
where things are found. Data is scraped from the
[dragonwilds wiki](https://dragonwilds.runescape.wiki) by the `scripts/`
pipeline, rendered as a static site on GitHub Pages, and progressively
corrected by hand-annotation (the `docs/checklists/` loop). There is no
backend: the site is files, the intelligence is in the build scripts.

## Who it's for

**Dragonwilds players at large** — someone planning what to craft next, trying
to remember where a material comes from, or tracing why a recipe is gated.
They arrive from the wiki or a search, click around without a tutorial, and
leave with an answer. Power users (the site's own contributors) go deeper:
they isolate subtrees, mark possessions, and share custom layouts.

## What success looks like

The Atlas becomes a **daily-use tool**: players open it when planning crafting
sessions and trust it as their reference. Signals: returning visitors, custom
layout snapshots being saved and shared, checklist answers coming back from
the community, and the unknown/partial location gaps shrinking toward zero.

## Non-goals (deliberate boundaries)

- **Static forever.** No backend, no accounts, no database, no analytics —
  GitHub Pages plus build scripts only. Anything needing a server is out.
- **Map, not wiki.** The wiki is the source of truth for lore and page detail;
  the Atlas links to it and never mirrors its content wholesale.
- **One map job.** Crafting dependencies and where things are found. No combat
  guides, quest walkthroughs, drop rates, or prices — those belong elsewhere.

## Platform & constraints

- **Browsers: modern evergreen** (latest Chrome/Edge/Firefox/Safari). New web
  APIs ship progressively enhanced — native capability when available (e.g.
  Popover API, CSS anchor positioning), a working fallback when not, no
  polyfill pile-ups.
- **Performance budget:** the graph is ~2,000 nodes / ~4,000 edges; interactions
  must stay smooth on a mid laptop (layout work belongs in the Web Worker;
  animations are transform/opacity only and kill-switchable).
- **Legal:** built under the [Jagex Fan Content Policy](https://www.jagex.com/en-GB/legal/fan-content)
  — the attribution stays verbatim in the legend and welcome card (see
  COMPLIANCE.md). Non-commercial; wiki content is cited, not republished.

## Brand & voice

**In-world tome.** The Atlas speaks as a runic artifact of Ashenfall — gold
Cinzel display type, ✦ runes, "Attuning the Atlas", spare second-person
microcopy — while staying a fast, legible tool underneath. Flavor lives in
identity moments; the data layer stays plain and scannable. The durable visual
system is documented in [DESIGN.md](DESIGN.md); when they disagree, the code
wins and both files get updated.

## Data truth

The graph is only as good as its annotations. Wiki-derived data is
best-effort; hand-filled checklists (and the merge-back pipeline) are the
correction mechanism. Contradictions resolve toward what a player can verify
in game, then toward the wiki.
