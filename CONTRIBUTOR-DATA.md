# CONTRIBUTOR-DATA.md — contributing to the data

How the atlas' dataset is produced, corrected and shipped — including the
end-to-end path for fixing a wrong row **in the app** and getting it merged as a
pull request.

For the code side of the project see [CONTRIBUTOR.md](CONTRIBUTOR.md).

## The three ways in

| You want to… | Do this | Ends up in |
|---|---|---|
| Fix a wrong name, kind, item type, wiki link, description or stat, or add a makes/gives/found-in relationship | Correct it **in the app**, export, `apply-edits.mjs`, PR — [Path A](#path-a-fix-the-data-in-the-app-then-ship-it-as-a-pr) | `site/data.*` |
| Refresh everything from the wiki after a game update | Run the **scraper pipeline** in order — [Path B](#path-b-full-wiki-refresh) | `cache/` → `site/data.*` |
| Answer "where is this found?" | Fill in a **checklist table** and merge it back — [Path C](#path-c-locations-the-hand-annotation-loop) | `site/found-in.js` |

Path A is the preferred way in: small, verifiable corrections beat a full
re-scrape, which re-litigates rows someone already checked in game.

## Ground rules

- **Licence.** The dataset is a derivative of the
  [Dragonwilds Wiki](https://dragonwilds.runescape.wiki) (Weird Gloop), licensed
  **CC BY-NC-SA 3.0** — attribution, non-commercial, share-alike. Icons are
  Jagex's, used under the Fan Content Policy (all rights reserved, revocable).
  Never relicense either as MIT. By opening a data PR you are asserting your
  contribution is compatible with those terms. Full detail:
  [LICENSE-DATA.md](LICENSE-DATA.md).
- **Data truth order.** What a player can verify in game, then the wiki, then
  inference. Never *invent* a recipe, a drop, a location or a stat to fill a gap
  — an honest empty value beats a plausible wrong one.
- **Every node keeps its wiki link.** `wiki` is how the project pays its
  attribution debt; `scripts/audit-links.mjs` reports coverage per kind. Nodes
  with no wiki page (implicit recipe variants, decoration outputs) are the only
  accepted exceptions, and they are tracked as such.
- **Be polite to the wiki.** Every wiki-facing script imports
  `scripts/wiki-config.mjs`: ~1 request/second by default (override with
  `RATE_MS`, e.g. `RATE_MS=250 node scripts/fetch-wiki.mjs`) and a descriptive
  `User-Agent` naming the repo. Don't burst, don't retry-hammer (429s back off),
  and don't add a script that skips the config.
- **Verify what you claim.** `node scripts/audit-cycles.mjs` (crafting loops) and
  `node scripts/audit-links.mjs` (attribution) are cheap; the counts quoted in
  `PLAN.md`/README should match what the scripts print.

## Where the data lives

| File | Tracked? | Role |
|---|---|---|
| `site/data.js` | ✅ | **What the site loads.** `window.DW_DATA = {…}` — the authoritative shipped dataset |
| `site/data.json` | ✅ | The same dataset as strict JSON (scripts, desktop tools, tests) |
| `site/found-in.js` | ✅ | `window.DW_FOUND_IN` — region / gather-method / tool annotations |
| `site/data.cyjs`, `site/data.graphml`, `site/atlas-style.xml` | ✅ | Cytoscape Desktop export bundle |
| `site/layouts/{manifest,curated}.js` | ✅ | Precomputed + curated position snapshots |
| `site/icons/` | ✅ | Item icons (Jagex assets) |
| `cache/final-dataset.json` | ❌ (gitignored) | The pipeline's working copy — `build-data.mjs` writes it, `apply-edits.mjs` and `fetch-icon-files.mjs` read it |
| `cache/raw/`, `cache/parsed/`, `cache/icons/`, `cache/xp/` | ❌ (gitignored) | Regenerable scraper intermediates |
| `docs/checklists/*.md`, `*.csv` | ✅ | The hand-annotation tables |

`cache/` is entirely gitignored, so a fresh clone has **no**
`cache/final-dataset.json` — bootstrap it from the tracked dataset (step 8 below).

## Dataset shape

`site/data.json` top-level keys, with real samples:

```jsonc
{
  "generatedAt": "…", "source": "https://dragonwilds.runescape.wiki",
  "nodes":  [{ "id": "Ash Tree", "name": "Ash Tree", "kind": "resource",
               "itemType": "Resource Node", "icon": "icons/Ash_Tree__281_29.png_93567",
               "wiki": "https://dragonwilds.runescape.wiki/w/Ash_Tree",
               "description": [], "stats": {}, "weight": null, "stacklimit": null,
               "repaircost": null, "catalogue": null, "pageid": 133 }],
  "edges":  [{ "from": "Air Rune", "to": "Windstep", "qty": 5, "facility": "Cast",
               "skill": "Agility", "xp": null, "blueprint": null, "variant": null,
               "deprecated": false, "source": "Windstep" }],
  "recipes":[{ "output": "Wall", "outputQty": 1, "inputs": [{ "name": "Ash Logs", "qty": 4 }],
               "facility": "Build Menu", "blueprint": null, "skill": "Construction",
               "xp": 8, "notes": [], "variant": "Cabin", "source": "Wall",
               "deprecated": false, "id": "Wall|Ash Logs:4|Build Menu||Cabin" }],
  "spells": [{ "name": "Windstep", "skill": "Agility", "level": 8, "cooldown": "3s",
               "runes": { "Air": 5 }, "description": ["…"], "image": "Windstep.png", "pageid": 179 }],
  "skills": [{ "name": "Agility", "image": "…", "icon": "…", "description": [ "…" ], "unlocks": [ … ] }],
  "skillLevelForItem": { "…": [ { "skill": "…", "level": 1, "text": "…" } ] }
}
```

Conventions that matter:

- **Edge direction is `from` = ingredient → `to` = product** (plans, paths,
  isolation and `audit-cycles` all assume it). A spell's cast cost is also an
  edge (`from` = rune, `facility` = `"Cast"`); a skill gate is a spoke from the
  skill node. Only recipe edges take part in crafting walks.
- **Ids are the display names** (`"Iron Bar"`), because panels, snapshots,
  found-in and the tests all key off them. Routing turns them into snake_case
  slugs for URLs (`site/routing.js`) — don't rename ids to slugs.
- **`kind` is a closed vocabulary** (the legend, colours and filters key off it):
  `weapon armour tool station ammo trinket food potion drink material resource
  spell skill implicit other region`. `kindColor`/`kindLabel` in `site/app.js`
  are the source of truth for the palette and labels — a new kind needs a colour
  there, a legend entry, and a `DESIGN.md` line.
- **Region hubs** (`kind: "region"`) are map aids mined from location prose, not
  crafting steps: recipes, plans, paths and exports ignore them, and their green
  spokes start hidden.

---

## Path A: fix the data in the app, then ship it as a PR

You edit in the browser, the app hands you a JSON file, and you run one script to
fold it into the dataset. No wiki scraping, no SQL, no cache rebuild required.
Steps 1–7 need **no repository at all** — you can prepare the edits on the live
site and bring only `dragonwilds-edits.json` to a clone.

### 1. Open the app

Either use the deployed site, or run the tracked `site/` folder locally:

```bash
git clone https://github.com/skamansam/dragonwilds-crafting-atlas
cd dragonwilds-crafting-atlas && npm install
cd site && python3 -m http.server 8477      # open http://localhost:8477
```

(Any static server works; `npm run dev` is currently broken — see CONTRIBUTOR.md.
Edits live in **your browser's** storage under the `dw.edits` key, so if you edit
on the live site, export before clearing site data or switching browsers.)

### 2. Review first

The ⚙ → **Your data edits** window (and this file) is the whole contract: nothing
you do in the app touches the shipped files, and every change stays inspectable
until you clear it. Start at the window's empty state — it tells you what it saw
before you touched anything.

### 3. Correct an item's fields

1. Search the item (**/** focuses search), press Enter to open its codex.
2. Press the **✎** beside its name. The panel becomes a form:
   - **Name** — the node id *and* the display name. Only change it if the
     display name is wrong; ids are the graph's keys (see the checklist).
   - **Kind** — must be one of the closed vocabulary above.
   - **Item type** — the raw `itemType` from the infobox (e.g. `Resource Node`).
   - **Wiki URL** — the source article. **Always fill this in.**
   - **Description** — one line each; blank lines are dropped.
   - **Stats** — one `key: value` per line (`power: 12`), labels as shown in the
     panel.
3. **Save**. The graph, the panel and every derived structure update live.
   - **Cancel** leaves the form without saving.
   - **reset to bundled** discards your edit for that node entirely.
   - **Hide item** removes the node (and its edges) from the atlas — an
     intentional deletion, not a field fix.

### 4. Add or fix relationships

The same **✎** form carries the **Links** section (the read view shows the same
links read-only):

1. Pick the relationship — **makes** · **gives** · **found-in**.
2. Type the target item (autocompleted from every node name) and press
   **＋ Add link**. It draws a real styled edge on the map — gold solid for
   *makes*, teal dashed for *gives*, green dotted for *found-in*.
3. **remove** on a row takes the link out again.

A link is a *graph relationship*: it does not fabricate a recipe, a quantity or a
facility, and `apply-edits.mjs` writes it as an edge with `source: "user"`. If
what you actually know is a full recipe, that belongs in Path B, not here.

### 5. Add or remove whole nodes

- **Add**: ⚙ → **Your data edits** → type a name, pick a **kind**, **＋ Add item**.
  The node is created with no links (add relationships in step 4) and is never
  treated as a dead-end orphan, so it is always visible.
- **Remove**: **Hide item** in that node's **✎** form — for a node that should
  not be in the atlas at all, not a wrong row.

### 6. Review the diff before you export

⚙ → **Your data edits** lists every difference between **this browser** and the
bundled dataset, one row per changed field (`bundled → yours`), with a count
badge on the ⚙ entry. Use it to:

- confirm each row is something you meant to change;
- **revert** a row (drops just that one) or **Clear all my edits**;
- notice edits marked **in dataset** — the shipped data has since caught up with
  your value, so there is nothing to submit and the row can be cleared.

### 7. Export the file

- **⤓ Export edits** → `dragonwilds-edits.json` — just your changes. **This is
  the file a PR wants.**
- **⤓ Export full data** → `dragonwilds-data.json` — the whole edited dataset.
  Only for a large overhaul; it replaces the graph wholesale.

The export carries `exportedAt` and **`baseGeneratedAt`** — the `generatedAt` of
the dataset your edits were made against. Check it against `site/data.json`'s
`generatedAt`: if they differ, the base has moved since you started, and you
should re-check your rows after merging (mention it in the PR).

### 8. Bring it into the repo

```bash
git checkout -b data/fix-iron-bar-item-type
mkdir -p cache && cp site/data.json cache/final-dataset.json   # fresh clone: no cache exists
```

The `cp` is the bootstrap — `cache/` is gitignored, and every apply/build script
reads `cache/final-dataset.json`.

### 9. Merge the edits

```bash
node scripts/apply-edits.mjs dragonwilds-edits.json --dry-run   # report, write nothing
node scripts/apply-edits.mjs dragonwilds-edits.json             # write
```

```
edits overlay: 1 node(s) updated, 1 added, 1 link(s) added
wrote cache/final-dataset.json + site/data.json + site/data.js
```

The script merges field by field and re-emits `site/data.json` + `site/data.js`
in exactly the shape `build-data.mjs` uses. What it does (and refuses to do):

- merges only the editable fields — `name kind itemType wiki description stats`
  (mirroring `EDIT_FIELDS` in `site/app.js`; **keep the two lists in step**);
- skips unknown node ids and reports them instead of creating nodes;
- prunes a hidden node **and its edges**;
- accepts a link only with a known relationship (`makes`/`gives`/`found-in`) and
  two known ids, writes it as an edge with `source: "user"`, drops duplicates;
- validates a **full-dataset** export first (non-empty string ids, no
  duplicates) and warns about edges referencing unknown ids.

The same logic is unit-tested in `tests/features/edits-apply.*`, so
`npx vitest run` after a merge is a real check, not a formality.

### 10. Re-derive what depends on the data

Field-only fixes need nothing more. If you added, removed or renamed a node, or
changed relationships, regenerate the artifacts derived from the graph:

```bash
node scripts/build-exports.mjs    # site/data.cyjs + data.graphml + atlas-style.xml
node scripts/build-found-in.mjs   # only if you touched location annotations
node scripts/audit-links.mjs      # attribution coverage — new nodes need a wiki URL
node scripts/audit-cycles.mjs     # new edges can create craft loops; check the report
```

### 11. Verify

```bash
git diff --stat                  # exactly the files you expect, nothing else
cd site && python3 -m http.server 8477   # open it, find the item, confirm the fix
cd .. && npx vitest run                  # the merge rules + the rest of the suite
node scripts/test-ui.mjs edits           # the in-app editing acceptance section
```

Look at the change in the app, not just in the diff: the panel text, the map
edge, the legend/filters if the kind changed. If a script or test fails, fix the
cause — never widen an assertion to make it pass.

### 12. Commit and open the PR

```bash
git add site/data.json site/data.js site/data.cyjs site/data.graphml site/atlas-style.xml
git commit -m "$(cat <<'EOF'
Fix Iron Bar's item type and link it to Ash Logs

Iron Bar was typed as a material though the infobox says Bar, and the
gives relationship to Ash Logs was missing. Both confirmed in game.

Generated with Codebuff 🤖
Co-Authored-By: Codebuff <noreply@codebuff.com>
EOF
)"
git push -u origin data/fix-iron-bar-item-type
gh pr create --title "Fix Iron Bar's item type and link it to Ash Logs" --body "$(cat <<'EOF'
## What changed
- `Iron Bar`: itemType `material` → `Bar`
- new `gives` link: Iron Bar → Ash Logs

## Why
Observed in game on 2026-10-08; the wiki infobox agrees.

## How
- edited in the app (`✎` → edit form → Links), exported with ⤓ Export edits
- `node scripts/apply-edits.mjs dragonwilds-edits.json` (1 node updated, 1 link added, 0 skipped)
- `node scripts/build-exports.mjs` regenerated

## Base
`baseGeneratedAt`: 2026-09-15… — matches `site/data.json` at the time of export.

## Checks
- [x] `npx vitest run` — 358 passed
- [x] `node scripts/test-ui.mjs edits` — 38 passed
- [x] `node scripts/audit-links.mjs` — no new unlinked nodes
- [ ] no `dragonwilds-edits.json` in the diff (the export is the input, not the change)
EOF
)"
```

(No `gh`? Push the branch and use the GitHub "Compare & pull request" button. Keep
`dragonwilds-edits.json` **out** of the commit — it describes the change; the
diff is the change. A maintainer can replay it from the PR description if they
want to.)

### 13. What review looks for

A data PR is judged on evidence, not volume:

| Question | Why it can send the PR back |
|---|---|
| Is the claim verifiable — in game, or on the wiki with a citation? | "Feels right" is not a source; the project prefers an honest gap |
| Is every touched node still carrying a `wiki` URL? | Attribution is the licence condition |
| Is `kind` in the closed vocabulary? | The legend, colours and filters key off it |
| Did ids change? | Ids are the graph's keys — renaming breaks snapshots, found-in and links |
| Are `data.json` and `data.js` in lockstep, and are they the only dataset files touched? | They're written by one script; a hand-edit of one is a bug |
| Were the derived artifacts regenerated if the graph changed? | Otherwise Desktop exports lag the site |
| Did the tests stay green, and were the numbers reported honestly? | The changelog quotes measured counts, so they need to be real |
| Is `PLAN.md` journalled (and README counts updated if the snapshot moved)? | The log is the project's memory |

---

## Path B: full wiki refresh

Needs internet. Run in order; each step reads the previous step's cache.

| # | Command | Produces |
|---|---|---|
| 1 | `node scripts/fetch-wiki.mjs` | `cache/raw/<pageid>.json` — ~3,650 main-namespace pages of wikitext, ~1 req/s |
| 2 | `node scripts/fetch-xp-tables.mjs` | `cache/xp/*.json` — the wiki's `Module:Skill experience/data/<Skill>.json` tables, so `{{ConstructionXP\|…}}` recipe args resolve to real XP |
| 3 | `node scripts/parse-wiki.mjs` | `cache/parsed/dataset.json` — infoboxes + `{{Recipe}}` templates → items, recipes, stations, skills, spells, level unlocks, image refs |
| 4 | `node scripts/fetch-icons.mjs` | `cache/icons/manifest.json` — icon file names → URLs via the imageinfo API |
| 5 | `node scripts/build-data.mjs` | **`site/data.js` + `site/data.json`** + `cache/final-dataset.json` — deduped recipes, canonical nodes, edges, `skillLevelForItem`, `generatedAt` |
| 6 | `node scripts/fetch-icon-files.mjs` | downloads icons into `site/icons/` and rewrites the icon fields in `data.js`/`data.json` to local paths |
| 7 | `node scripts/build-found-in.mjs` | `site/found-in.js` |
| 8 | `node scripts/build-exports.mjs` | `site/data.cyjs`, `site/data.graphml`, `site/atlas-style.xml` |
| 9 | `node scripts/build-location-checklists.mjs` | regenerates `docs/checklists/*.md` (see Path C — **fold answers back first**) |
| 10 | `node scripts/audit-links.mjs` · `node scripts/audit-cycles.mjs` | coverage + craft-loop report to eyeball |

Notes and traps:

- **Icons**: `fetch-icon-files.mjs` writes local paths into the dataset, so it
  must run **after** `build-data.mjs`. Icons above ~60 KB are meant to be shrunk
  before committing; ~95% of nodes have one, the rest fall back to a category
  glyph.
- **The site must still boot with no cache at all.** If a generated file is
  missing, the app falls back gracefully (`found-in.js` is guarded) — don't
  introduce a hard dependency on a cache file.
- **Re-running `build-location-checklists.mjs` overwrites `docs/checklists/`.**
  If the previous tables had answers, merge them back into `site/found-in.js`
  first.
- The wiki is a **manual snapshot** (currently the 1.0 update, 15 Sept 2026);
  there is no scheduled re-scrape. Say so in the PR if you move the snapshot
  date, and update the README's "What's in the data" counts to match.

### Folding browser edits into a refresh

If contributors have been editing in the app and you are about to re-scrape, run
their exports in first and diff — a full rebuild **discards** anything not in
`cache/`, so land the small corrections before the refresh, or port them by hand
afterwards.

## Path C: locations, the hand-annotation loop

The found-in parser is best-effort: `build-found-in.mjs` mines the cached wiki
prose for (region, method, tool) — infobox `|location = [[Region]]` first, then
comma-clauses in the prose, skipping `(except …)` clauses and borrowing the
nearest method sentence. What it can't resolve becomes a checklist row.

1. Generate the tables: `node scripts/build-location-checklists.mjs`
   - `docs/checklists/needs-locations.md` — has a method, missing region(s)
   - `docs/checklists/unknown-source.md` — no annotation at all, grouped by
     likely progression
2. **Annotate while playing.** One row per item:
   `Item | Wiki | How it's obtained | <34 location columns> | Notes`. Put `x` in
   every column where you found it; use **Notes** for what prose can't carry
   (which monster, which chest, which tool). Already-known regions come
   pre-ticked.
3. **Prefer the CSV for 38-column editing** (spreadsheets beat markdown
   editors):

   ```bash
   node scripts/checklist-csv.mjs unknown-source          # md → csv
   node scripts/checklist-csv.mjs unknown-source --merge  # csv → md
   ```

   Locations take `x`/blank; leaving **How** blank keeps the generator's text,
   so clearing a cell means "keep what it said".
4. **Merge the answers into the data.** Fold the filled rows into
   `site/found-in.js` (the intended home for hand-verified finds — the
   merge-back step is still manual, and a script for it is a welcome
   contribution), regenerating that file from the wiki prose only *after* the
   answers are in. Then re-run the checklists and confirm the answered rows
   disappear.
5. Commit `site/found-in.js` + the annotated tables (and the CSV if you used it)
   with the same PR shape as Path A — evidence in the body, counts reported.

## Other data surfaces

- **Precomputed layouts** — `node scripts/gen-layouts.mjs [algo …]` runs the
  algorithms headlessly and merges positions into `site/layouts/manifest.js`
  (`window.DW_LAYOUTS = { <algo>: { <nodeId>: {x,y} } }`), never clobbering
  existing algos. **Saved positions** then apply them instantly.
- **Shared layouts** — export a 💾 snapshot from the site and merge it:
  `node scripts/merge-snapshots.mjs dw-snapshot-….json [--label "…"]` (plus
  `--list` / `--drop "<preset>@<dens>"`). It validates bounding box, finite
  coordinates and that the node ids exist before touching
  `site/layouts/curated.js`. Never put metadata inside a position map — sibling
  `"<key>~meta"` objects only.
- **Desktop exports** — `node scripts/build-exports.mjs` regenerates
  `data.cyjs` + `data.graphml` + `atlas-style.xml` from `site/data.js`. Every
  dataset field becomes a column, edges carry an `interaction` column
  (`craft` / `spell` / `skill-gate` / `region`), and a deterministic layered
  seed layout is baked in. Re-run it whenever the graph changes.
- **Audits** — `audit-links.mjs` (attribution coverage by kind),
  `audit-cycles.mjs` (Tarjan SCCs + enumerated simple cycles; either a genuine
  refining loop or a data bug worth flagging).

## Data-change checklist

- [ ] Every new or edited node keeps a working `wiki` URL (or is a documented
      exception)
- [ ] `kind` comes from the closed vocabulary; a new kind also gets a
      `kindColor`/`kindLabel` entry, a legend row and a `DESIGN.md` line
- [ ] Edge direction is ingredient → product; recipes/plans stay consistent
      with it
- [ ] No invented recipes, drops, locations or stats — unknown stays unknown
- [ ] Names/ids unchanged unless the rename is the point (ids are the graph's
      keys; renaming breaks snapshots, found-in and links)
- [ ] `site/data.json` and `site/data.js` are in lockstep (both rewritten by the
      same script — never hand-edit one)
- [ ] Exports regenerated if the graph changed; checklists folded back before a
      regenerate
- [ ] `npx vitest run` (the `edits-apply` scenarios drive the merge logic) and
      the acceptance suite still pass
- [ ] `PLAN.md` journal row with the measured counts; README counts updated if
      the snapshot moved
- [ ] `dragonwilds-edits.json` is **not** in the commit (it is the input, not the
      change) and no `cache/` file snuck in
- [ ] Licence/attribution intact (CC BY-NC-SA for the dataset, Fan Content
      Policy for icons)
