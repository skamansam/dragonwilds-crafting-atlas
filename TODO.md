# TODO:

[x] First off, the graph is WAY too dense. I can't see or reead anything - it looks
— DENSITY PASS (P3-1): skill-gate edges now start hidden (1,477 fewer edges on first
load, persisted preference), and the default cose-bilkent preset is airier
(idealEdgeLength 135, nodeRepulsion 30000). Combined with the Dead-ends toggle and the
saved-positions snapshot, the first view is readable.
like a big blob with a bunch of stuff around it.

[x] The skill trees should be a part of the graph as well, so you know
what skill level you need.

[x] In the badges in the top, you can't unselect everything to get a blank screen.

[x] when using the isolate tree function, all the nodes in the tree should
automatically become visible.

[x] There should be a selector for the layout algorithm so we can see the graph in different ways.

[x] There should be a layout algorithm that shows the graph as a top to bottom tree.

[x] I would like for the ability to check off what I have and show only the things
I can reach. For instance, if I have the sawmill, I will be able to see only the
things the sawmill can make or enable.

[x] the items in the How to make section of the info panel should be clickable and
would activate the corresponding node.

[x] The isolate tree functionality should show the items inouts and outputs all the way until
there are only leaf nodes left.

[x] There should be some kind of feedback when the layout
is happening so users will knwo when there is a layout
change. Currently, there is no way fo rhte user to knnow
anything is happening. We should really try to get some background
processing or threading done so it doesn't lock up the UI.

[x] There should be a number of links and nodes shown somewhere. I think you
should move the DB counts in the right of the header to just under the title and search bar.
Then show the links and nodes that are shown under the layout selction. Tihs should leave more
room for the category filtering chits.

[x] Can you add the layout algorithm name in the layout dropdown, so we know
which one is being used. We also need a force-directed checkbox to let the
algorithm know it is force-directed. This force-directed approach may solve the
issue of the cluster being too tight to read. There is an article on these at
https://blog.js.cytoscape.org/2020/05/11/layouts/ . We need to add several layout
options/algorithms: tidytree, breadfirst, klay, elk, cola, cise, and more, for testing.
Do a google search for a bunch of these algorithms and we can decide which ones to keep.

[x] The changes to the isolate tree are not really useful. Can we add an input below the
isolate tree button that shows how far deep to go, with a default of 3? It should
show that depth forward and backwards in the tree.

[x] I don't know if this is a feedback issue, but when I select a new layout algorithm, the force
directed algorithms continue to calculate layout and the selected algorithm does not appear to
do anythng.

[x] We should add a toggle for disabling animations for layouts. (add `animate: false` to the layout options) — DONE: **animate** checkbox in the header, persisted.

[x] It looks like physics-based layouts are taking forever. We can speed them up by running them in
memory before showing them by adding  `maxIterations: 1000, maxSimulationTime: 3000` to the layout options.
— PARTIAL: each extension exposes a different knob (`numIter` for bilkent/fcose,
`maxSimulationTime`/`maxIterations` for cise/cola/euler); caps are now tuned per preset
(a literal 1000/3000 was measured too tight for 1,408 nodes — cola needs 4s+). For the
full speed-up, use **saved positions** (next item) or **animate off**.

[x] We can also have precaclulated layouts for the graphs. The available nodes should be
able to store a preset config for layouts. I can use the cytoscape desktop app to configure
these, but if you could give me a start with what you think a good heirarchical layout would look like,
please do.
— DONE: `scripts/gen-layouts.mjs` computes snapshots into `public/layouts/manifest.js`
(elk-layered hierarchical + cose-bilkent bundled); the **saved positions** checkbox applies
them instantly. Desktop-authored configs: export positions and add them to the manifest as
`"<algo>": { "<node id>": { "x": …, "y": … } }`.

[x] When clicking on the path to.. button, a new panel should show at the top of the graph that allows
— DONE: a gold **Path-to bar** appears at the top of the map while a query is armed
(pulsing, shows the source and instructions), then summarizes the result
("Path: Ash Logs → Iron Sword · 3 steps") until cleared; ✕ cancel + Esc both clear.
the user to search for a node to link to.[x] We have feedback now for layouts, but it is not showing up due to the blocking nature of the layout algorithms.
    → DONE (2026-09-24): the gold **Arranging pill now carries a live progress bar**. The
    heavy algorithms are synchronous on the main thread, so ticks land between compute
    chunks — the bar is time-calibrated (per-preset seed table + an EMA of your own
    finished runs) and decelerates into the last 5% so it always completes at layoutstop.
    It survives the supersede path too: switching presets mid-run (including into a
    bundled-snapshot preset, where no layoutstop fires) stops the bar immediately.
can you do some research to find out whether we can offload this to a service worker or some other
thread-like construct?

[x] Where is each item found? Add region / gather-method / tool annotations to the info panel.
    → DONE (2026-09-24): panels show a **Found in** section mined from the cached wiki
    prose (scripts/build-found-in.mjs → public/found-in.js): region, gather method (mined /
    chopped / picked / farmed / fished / chest / dungeon / drops) and the tool where the
    wiki names one (e.g. Ash Tree → Bramblemead Valley, chopped with a logging axe).
    575 items annotated (123 with regions, 452 method-only). Future: region pseudo-nodes
    on the map + click-to-jump from the rows.

[x] New graph question: "what does this item allow me to craft?" — the reverse of trace inputs.
    → DONE (2026-09-24): panels already list **Used to make** (direct recipes); a new
    **Trace makes ⤴** button highlights the full downstream subtree on the map (direct +
    transitive) with a count toast, mirroring Trace inputs.

[x] Explore-tree isolation may be too greedy — the both-direction walk-to-leaves pulls in
    nearly the whole graph for hub items (e.g. any bar/log). Consider a direction-dominant
    walk or a default depth cap, or leave full-tree as an explicit choice. (Isolation is
    intentionally left as-is for now — parked, not rejected.)
    → PROTOTYPE SHIPPED (2026-09-24): a direction select now sits beside Isolate tree —
    outputs only (promoted to DEFAULT the same day) / inputs only / up + down. Measured:
    the both-walk is a 1,408-node knot (72% of the map) for every hub item, while
    outputs-only is 89 nodes for Iron Bar, 297 for Ash Logs. Toast reports direction +
    item count. Depth caps compose with the direction. A stored choice (incl. both) wins.

[x] The trace inputs algorithm isn't quite working properly. Click on isolate tree for Draconic
   staff, then click trace inputs and you get iron bar, granite, jade, vault shard. Then trace again
   and it shows iron ore and iron salvage for the iron bar. Clicking trace inputs again says there
   is nothing further upstream. However, it says in the build section of draconic staff that the
   mystic Forge and Furnace are needed, but they do not show up in the graph. These should be there.
   Clicking again after those items are shown should reveal what is needed to make them, and on and on.

[x] We should keep track of graph state (layout, settings, owned items, etc.) according to cahracter. On startup, if there is not a character already saved,  we need to ask for it. If there is already saved data and no character, we ask if we want the
saved data stored with that character. The character should have the character's total level next to it, which is calculated
by adding up the current level of all the skills. This measn for the base skill nodes, we need a way to keep track of the
skill level for each base node.

[x] We need to be able to edit the data in the app. The edits should be saved in the browser, then we should be able to save the data as  file. W e need a script that will update the data based on a saved file. For relationships, we should be able to search for the item to link to, along with the relationship. This is only for the node data so that it only shows makes or givves or whatever relationship and the node.



[x] Owned items should stand out — both in the graph and in the info box (codex panel).
    Paths between owned items should be a certain colour, and paths that go from one owned item
    ("enables") to another should be another colour. I want a way to show what I own and the next
    upcoming items I will get from it: if I have skill 32 and the next level unlocks something,
    show that item next to the stuff I already own. For items that need something else to show up,
    show that in a similar fashion.

[x] We need to add quests as nodes to the graph. All the graph data is at
    https://dragonwilds.runescape.wiki/w/Quests. The quests all provide rewards, so the links
    should be <region> -> <quest> -> <item>. For the description of the quest, just add the
    'where to start' bit from the tables on that page.
    → DONE (2026-10-09, P7): 37 quest nodes from the wiki's Quests page (type, tier, region,
    the 'Where to Start' line as the description) linked region -> quest -> reward (35 reward
    items). Mounts are the other half: the wiki's Mount page gives each mount's requirements
    and how to get it, so 20 mount nodes entered the dataset ({{Infobox Mount}}) and 21 mounts
    carry a quest-requirement + acquisition line, wired quest -> mount. Both layers are ON by
    default (the new 'Quest links' legend row is the first link layer that ships enabled).

[x] We need to add an agents.md file. We need to add bits about good development style:
    → DONE (2026-10-11): **AGENTS.md** at the repo root — naming (semantic full-word
    names, no single letters outside a single-line lambda), self-documenting code
    (comments answer WHY, the code answers WHAT), required JSDoc with real types
    (@typedef at the top of the file for complex shapes), and house practice for
    JS (ESM, `dw.` state keys, `esc()` before innerHTML, worker/caps for heavy work),
    CSS (tokens not hex, user-facing colour vocabulary, transform/opacity only,
    touch parity) and HTML (stable ids, real buttons, aria-label, classic scripts
    before the module entry), plus the verify-before-you-land protocol.
   - always use symantic names for varaibles and functions regarding what they are for. For instance, instead of saying `convertAlephtoBin`, say `convertAlphabetToBinary`
   - never use single letters for variables or functions except when in a single-line lambda
   - the code should be self-documenting
     - comments are for WHY not WHAT
     - the WHAT is answered in the code
     - the WHY is answered in the comments
     - always use jsdoc to document variables and functions\
     - always use proper types in jsdoc. for complex types, create those types in jsdoc comments at the top  of the file
   - add any other good practices to follow in js/css/html development

[x] We need to add ALL regions to the dataset. currently, there are only a few,  but the page at https://dragonwilds.runescape.wiki/w/Ashenfall says there are 5 main regions with at least 3 territories each. Every page for the regions and territories says what resources are available in each one. These regions and item links whould be added to the dataset.
    → DONE (2026-10-12): all 34 canonical regions and territories are in the dataset, and so
    are their item links. The green region hubs used to know only what found-in.js mined out
    of *item* pages, so a territory no item page named had no hub (Bleakfields Valley was
    "legitimately empty") and the rest knew a fraction of their contents. The wiki answers it
    from the other side: every region and territory page carries a ==Resources== section, and
    new scripts/build-region-resources.mjs parses those into public/region-resources.js —
    22 of the 34 pages, 307 region→resource links (227 of them new beside found-in's 901),
    with the 11 stub pages reported rather than silently empty. The app unions the two
    overlays per hub, so hubs went 23 → 27 (Bleakfields Valley, Dragon's Run, Witchwillow
    Range and The Approach exist only because of this source) for 1,128 region→item members,
    an item both sources know shows both gather verbs, and data.cyjs/data.graphml carry the
    same links. Update with: node scripts/build-region-resources.mjs (--offline skips the
    network; see CONTRIBUTOR-DATA.md step 7b).
    → FOLLOW-UP (2026-10-15): every one of the 34 canonical regions is a hub now, not just
    the 27 either source or a quest named. The 11 pages with no ==Resources== heading are
    named in the overlay as `stubs`, so an empty hub's codex says *the wiki has not written
    that page yet* instead of showing a blank list (a page that merely resolves to nothing is
    never claimed as one); the exports carry the same 34 hubs (2,123 nodes) and check-sources
    mirrors the full list. The deploy workflow now runs
    `node scripts/build-region-resources.mjs --check` before building, so a wiki page that
    gains a resource list fails the deploy instead of shipping a stale overlay. And a phone
    (≤720px) can reach the legend at all: the header's new ◈ button opens it as a sheet,
    which is the only door to the Region/Quest link rows there.

[x] When using the buttons in the item panel (isolate node, etc.), the graph does not recalculate.

    → DONE (2026-10-15): the panel's own buttons are explicit requests, so they now recompute the
    shown graph whatever the "re-layout on graph change" option says (that option governs reflows
    nobody asked for — filters, possessions; the header's layout select always worked this way).
    isolateTree() arranged nothing before, and the requires/enables buttons wrote their .hidden
    classes straight to the graph with no re-schedule, so an isolated tree stayed in full-map
    coordinates. The layout runs a beat after the click, because visibleOnly reads ':visible',
    which the style pass applies after the class writes. Covered by the new `panelcodex`
    acceptance section (44 of 44 isolated nodes move), and the pinned `layouts` checks now
    assert the split: a filter change does NOT reflow with the option off, the Isolate button does.
[x] in the region node panel, there should be the mark as owned icon so we keep track of the items we have found easier. This should also be done for all the items in all the node panels, including things in the chips in the "waht you need" section.

    → DONE (2026-10-15): one ☆/★ toggle on every ownable thing a panel lists — the region hub's
    found-in rows, the plan's Gather/Build/Train and critical-chain chips, direct materials,
    recipe inputs and unlock items, used-to-make rows, quest rewards. Regions, quests, skills and
    spells are map context and never get one. The star swallows its own click, so the row still
    jumps to the item it names (`panelcodex` checks both), and a chip wears the same teal
    "you have it" tint the plan already used.
[x] the region node panel should have the same buttons for exploration as the others, but only for outgoing links

    → DONE (2026-10-15): the region codex gets the same two-step as an item — **Contains ⤴** (its
    gatherables and its quests), **Step back**, **Reset** — and no upstream button, because nothing
    contains a region. What changed is that the words now come from one vocabulary table per node
    kind, and the quest and mount codexes get the same rows instead of none (a quest is set in
    regions and rewards items; a mount needs quests).
[x] the buttons in the node panel overflow the panel. they should probably be stacked instead of side by side. The isolate button should be int eh same row as the number to isolate though

    → DONE (2026-10-15): the action block is stacked rows — the highlight two-step with Step back
    and Reset, then Isolate beside the depth box and the direction select (the two keep their
    width, the button takes what is left), then the wiki link. Measured with scrollWidth vs
    clientWidth at 1600/420/360px: no row is wider than the panel it lives in (`panelcodex`
    asserts exactly that at all three widths).
[x] when recacluating the layout, the canvas should automatically zoom in or out so the nodes fill the view.

    → DONE (2026-10-15): every layout completion fits the SHOWN nodes (`fitVisible()` =
    `cy.fit(cy.elements(':visible'))`), never the whole model — an isolated 44-node tree used to be
    framed together with the other 2,079 (zoom 0.018, a speck). The one place that still fitted the
    model was the highlight's own refit; it is gone. A reflow that nothing changed shape for does
    not fit at all, so a highlight click on the full map no longer yanks the zoom.
[x] we really need to find another term for the enables/requires buttons. I think they should be different per type. For regions, should be contains/contained by, for other items should be makes/made from, and others maybe makes/found in, and so on. These button should make sense for the node itself or maybe just node types. We don't have to worry about the nodes that are two or more steps away, just the immediate ones. Users should see what teh buttons are doing.

    → DONE (2026-10-15): HIGHLIGHT_WORDS names the two directions per node kind — items **Made
    from ⤵** / **Makes ⤴**, regions **Contains ⤴** (no upstream), quests **Set in ⤵** / **Rewards ⤴**,
    mounts **Needs ⤵** (no downstream) — and the same table supplies the button tooltips, the
    isolate direction option ("contains", "set in + 1 reward", "needs"), the Isolate label
    ("Isolate what it holds" / "its region and rewards" / "its quests") and the toasts
    ("Bleakfields Valley · contains level 1: +17 nodes"). A kind with only one direction renders
    only that button, so nothing reads "null". Ids, the walk and the persisted highlight are
    untouched — this is copy, in the one place that renders it.
[x] The found in sections in the node panels are not aligned properly. There is way too much space around the icon

    → DONE (2026-10-15): the icon column is tight (18px + a 6px gap, was 22px + 8px) and the name is
    one FIXED 118px column that ellipsises instead of growing, so the method column starts at the
    same x on every row — that is the alignment (it used to be min-width: 118px, which let a long
    region name push its own method text out of line). `panelcodex` measures it: every row reports
    one icon width, one gap and one name-column offset.
[x] we need to add support for webmcp so it is easy for agents to use our site. see https://developer.chrome.com/docs/ai/webmcp on how to implement this feature.

    → DONE (2026-10-15): src/webmcp.js registers **13 tools** through
    `document.modelContext.registerTool` exactly as the imperative API documents them — name,
    description, an `inputSchema` in JSON Schema and safety `annotations` (`readOnlyHint` true for
    the eight that read, false for the five that move the view or the ledger): atlas_search_items,
    atlas_get_item, atlas_get_plan, atlas_find_path, atlas_get_region, atlas_get_quest,
    atlas_get_owned, atlas_get_state, atlas_focus_item, atlas_isolate_tree, atlas_highlight_links,
    atlas_set_owned, atlas_set_filters. Every tool is an adapter over the app's own machinery (the
    panel's plan, the path BFS, the highlight walk, the legend rows' clicks), injected by
    `initWebMcp()` — no second implementation, so a tool and a click cannot disagree. Progressive
    enhancement: without the API nothing registers, the DOM is untouched and `window.DW_WEBMCP`
    still carries the tool set for the console and the harness. The new `webmcp` acceptance section
    stubs `document.modelContext` the way Chrome exposes it, asserts all 13 register with a schema
    and safety hints, then executes each one against the live app (a codex read, a plan, a route, a
    region, an unknown name, and every state-changing tool verified on the map/legend/ledger rather
    than on its own return value). Documented for agents in public/llms.txt, for users in README.md
    and for contributors in CONTRIBUTOR.md.

[x] the node panel should always end with the link to that node's own wiki page.

    → DONE (2026-10-16): every codex now ends with a `Wiki page ↗` row — the dataset's own
    URL where the node carries one, derived from the node's name for a region hub or a quest
    (their overlays carry none: they are synthesized from those very pages), and no row at all
    for the one kind no page describes. The region and quest panels had none — the request was
    that they get one at the bottom of the panel, which is where the item panels already had
    theirs. Coverage: the new `panelcodex` sweep opens a codex for each of the 18 kinds the app
    can show (the 16 in the dataset plus region and quest) and asks the same three things of
    each — it renders, every ownable row carries its ☆, and its last row is the wiki link
    (null for the kind no page describes). The sweep found the one ownable row that had no star:
    the station a recipe is made at (`.recipe-facility`), which the plan already lets you tick.

[x] I think the graph should default to showing basically what you see in the beginning of the
game. The Brynmoor region, temple woods, the first steps quest, and all the skill nodes.

    → DONE (2026-10-16): a fresh browser opens on the **beginning of the game** instead of all
    2,123 nodes — 41 nodes and 43 edges, computed from the data rather than listed by hand: the
    tutorial quest (**First Steps**, the one whose wiki page says it starts automatically with a
    new character), the region it is set in (**Temple Woods**), that region's division
    (**Brynmoor**, from the Ashenfall page's ==Geography== overlay — no region page says which
    division it belongs to), everything found in the region (26 items, the union of found-in.js
    and the region page's own ==Resources== list, exactly as the hub computes them) and all
    **12 skill nodes**, because the skills panel is the other thing a new character already has.
    Its **dead ends come with it**: 9 of the 41 are drop-only gatherables (41 → 32 with the
    dead-end row off), and the tutorial region is mostly ore veins, trees and drops — a filter
    meant to cut 253 orphan leaves out of the 1,477-node DAG would have hidden the very items
    this view exists to show. So `showOrphans` is on for a visitor whose link did not say
    otherwise (`?orphans=0` still gets what it asks for), and the Dead ends row reads ◆ from the
    first paint — one `setDeadEnds()` beside the legend row now owns the flag, its storage and
    both controls (the retired header chip and WebMCP's `dead_ends` arg went through two other
    copies, one of which left the row stale). It is a **view, not a mode**: a kind row, a search
    or **Show everything** leaves it and remembers that (`dw.starterView`), **↺ All** returns to
    it node for node, and a node it hides is *revealed* rather than refused when asked for by
    name — a `#/iron_bar` deep link, a recipe chip, an agent tool call. Two params describe it,
    `?starter=` and `?orphans=`, both pinned in `OPTION_PARAMS`. The agent interface got the
    half of this an agent cannot see: `atlas_get_state` now says `Starting area: on — the first
    minutes of the game, so most of the map is not drawn` (41 of 2,123 is not a bug to triage),
    and `atlas_set_filters` leaves the view, because asking for one kind is the same request a
    kind row makes — it used to answer with a handful of nodes and no way to know why.
    Coverage: a new **`starter`** acceptance section (15 checks — the set it holds is exactly
    the tutorial's neighbourhood and nothing else, all 12 skills, the dead ends, the row that
    turns them off and back, leaving via a kind row and the storage it writes, ↺ All returning
    the identical id set, a search leaving it, a deep link revealing a hidden node while the
    view stays on, and both URL options) and `scripts/test-ui.mjs`'s `boot()` grew its contract:
    the suite's baseline is the whole map (`?starter=0`, pinned) with a `firstLoad` argument for
    the one section that must boot the real default and a `hard` one that reloads a hash-only
    URL, since that alone is a same-document navigation. Three checks that pinned the old
    behaviour were rewritten to the new intent rather than relaxed: the quests section now
    asserts Region links start ON (then off, then on — it had pinned "off by default"), the
    phone check proves a phone can reach the row by switching the layer off and back on, and the
    WebMCP isolation check compares the tree it drew against the map instead of against a page
    that happened to start from 42 nodes. Docs in step: README (a **first view** section, the
    legend paragraph, the URL table, the tests paragraph), CONTRIBUTOR.md (the `boot()` contract),
    public/llms.txt (what an agent should read into "Nodes drawn: 41 of 2123"); `vitest`
    **519/519**, the acceptance suite green section by section, `npm run build` clean.

[x] "Where exactly do I find this?" — the atlas knew the region, not the spot: the codex now hands the reader to the live Wyrmwatch map, pre-filtered to that node's own markers.
    → DONE (2026-10-16): data.json carries no coordinates for anything, so "show me where" had no answer inside the site. The Wyrmwatch map on survivalservers.com draws 25,298 markers from the game's own files, and its reference file says which type key each one is drawn under. New pure scripts/map-links-core.mjs joins an atlas node's name to those keys (case/underscore-insensitive, a trailing disambiguator tolerated, never substring/prefix — that is how Soul Stone would land on 3,377 Stone boulders) and fits the view that frames the type's own markers; scripts/build-map-links.mjs adds the cache and the network and writes public/map-links.js (window.DW_MAP_LINKS, an overlay like the others — data.json untouched). Result: 78 nodes / 54 of the 83 gatherable marker types / 21,113 markers behind them, 42 of 49 resources; the seven with no counterpart (Blightwood Root, Blurite Ore Node, Dead Tree, Fibrous Pipe Cactus, Kalphite Egg, Sapling, Soul Stone) are reported by name and stay unlinked rather than guessed. The link shape came out of the map's own wyrmwatch-map.js and was confirmed in a browser: it is a HASH (`#view=x,y,zoom&filters=keys`, plus `level=1` underground) — a query string does nothing, and a filter-only hash silently shows the map's defaults — so every link carries a fitted view, and the map's "copy view" button re-encodes one to the identical string. src/map-links.js turns an artifact entry into that hash and one summary sentence; src/app.js renders the codex's `Live map ↗` row only when mapLinkFor() answers, so a node the map draws nothing of gets no row (its wiki row is still there); the agent gets atlas_map_link, the 14th WebMCP tool, returning the same URL and a plain explanation on a miss. The reference file is cached, not committed; --refresh re-downloads it (the host challenges scripts with Cloudflare, so the header explains saving it from a browser) and --check compares the committed overlay when a reference exists and always verifies every linked id against data.json — the deploy workflow runs it. Coverage: new Gherkin tests/features/map-links.{feature,spec.ts} (18 tests — the strict join, multi-key labels, underground, the framing zoom, world-bounds clamping, the artifact naming only types it carries, the resource report, and the exact hash for surface/underground) plus a new `maplinks` acceptance section (9 checks — the row's exact href/target/rel/tooltip, a view+filters hash with all seven anima keys, all 78 nodes through the real panel, 20 unlinked nodes with no row, Soul Stone keeping its wiki row, and both WebMCP answers). Docs in step: README, CONTRIBUTOR.md, CONTRIBUTOR-DATA.md, public/llms.txt and this file.
