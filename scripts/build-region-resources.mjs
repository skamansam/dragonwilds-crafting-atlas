// Builds public/region-resources.js — what each Ashenfall region and territory
// actually holds, mined from the ==Resources== section of its own wiki page.
//
// The found-in overlay (scripts/build-found-in.mjs) reads *item* pages and asks
// "where is this found?"; this reads the *place* pages and asks the opposite,
// which is the only source there is for a territory no item page ever names.
// Between them the region hubs' "What you find here" list is complete: the
// Ashenfall page's five divisions and their territories, each listing its own
// nodes, plants, trees, fish and loot.
//
// Shape (an overlay, like found-in.js / quests.js / mounts.js — data.json is
// never touched, src/app.js folds this into the region hubs at boot):
//   window.DW_REGION_RESOURCES = {
//     source, generatedAt,
//     regions: { [region]: { [itemId]: [method, …] } },
//   }
//
// A page's Resources bullets mix scenery and produce in one list ("[[Ash
// tree]]s" beside "[[Ash logs]]"), so every link is resolved on its own and the
// ones with no atlas node (scenery like *Crystal tree*, lore like *Sanguine
// Urn*, the generic *Chest* pages) are reported rather than invented.
//
// Regenerate with:  node scripts/build-region-resources.mjs [--offline]
//   --offline  resolve only against cache/raw, never the network
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANON_REGIONS } from "../src/regions.js";
import { fetchPage } from "./fetch-page.mjs";
import {
	collectResources,
	parseResources,
	resolveNodeId,
} from "./region-resources-core.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "cache", "raw");
// where the wiki's own answers about link titles are kept. The bulk cache can
// never settle these: asking the API with `redirects=1` returns the page a
// redirect led to and caches *that* page, so without this the redirect itself
// leaves no local trace and every run would have to ask again.
const REDIRECTS = path.join(ROOT, "cache", "redirects.json");
const offline = process.argv.includes("--offline");

/* ── the two indexes resolution needs ───────────────────────────── */

// every node the atlas has, lowercased (ids come from page titles, so the
// comparison has to be case-insensitive: the wiki writes "Ash logs", the
// dataset carries "Ash Logs")
const dataset = JSON.parse(
	fs.readFileSync(path.join(ROOT, "public", "data.json"), "utf8"),
);
const byLowerId = new Map();
const kindById = new Map();
for (const node of dataset.nodes) {
	byLowerId.set(node.id.toLowerCase(), node.id);
	kindById.set(node.id, node.kind);
}

// the wiki cache, lowercased by title, so a link can be followed through the
// wiki's own redirects ("Coal deposit" → "Coal Node")
const pagesByLowerTitle = new Map();
function readCache() {
	pagesByLowerTitle.clear();
	if (!fs.existsSync(RAW)) return;
	for (const file of fs.readdirSync(RAW)) {
		if (!file.endsWith(".json")) continue;
		try {
			const page = JSON.parse(fs.readFileSync(path.join(RAW, file), "utf8"));
			if (page.title) pagesByLowerTitle.set(page.title.toLowerCase(), page);
		} catch {
			/* half-written cache entry — ignore */
		}
	}
}
readCache();

/** The canonical title a link title resolves to, or null.
 *
 *  Two ways in, because the wiki answers a redirect server-side: a title the
 *  bulk cache happens to hold as a `#REDIRECT` page can be followed locally,
 *  and a title the cache cannot settle was fetched through the API (which
 *  reports the page it redirected *to*), so that answer is remembered in
 *  `apiResolved`. One hop is enough — the wiki does not chain redirects. */
function redirectOf(title) {
	const key = String(title).toLowerCase();
	const viaApi = apiResolved.get(key);
	if (viaApi && viaApi.toLowerCase() !== key) return viaApi;
	const page = pagesByLowerTitle.get(key);
	const redirect =
		page && /^\s*#redirect\s*\[\[([^\]]+)\]\]/i.exec(page.wikitext);
	return redirect ? redirect[1].split("|")[0].trim() : null;
}

/* ── read each region page (cache first, wiki on demand) ─────────── */

/** The page for `title`: cache/raw when it is there, otherwise fetched and
 *  cached through fetch-page.mjs, which shares the project's 1 req/s etiquette. */
async function regionPage(title) {
	const cached = pagesByLowerTitle.get(title.toLowerCase());
	if (cached) return cached;
	if (offline) return null;
	try {
		return await fetchPage(title);
	} catch (error) {
		console.error(`  ! ${title}: ${error.message}`);
		return null;
	}
}

const apiResolved = new Map(); // asked-for title → the page the wiki resolves it to
if (fs.existsSync(REDIRECTS)) {
	for (const [from, to] of Object.entries(
		JSON.parse(fs.readFileSync(REDIRECTS, "utf8")),
	)) {
		apiResolved.set(from, to);
	}
}
const perRegion = [];
const noData = [];
for (const region of CANON_REGIONS) {
	const page = await regionPage(region);
	readCache(); // fetchPage may have written a new entry
	if (!page) {
		noData.push(region);
		continue;
	}
	const links = parseResources(page.wikitext);
	if (!links.length) {
		noData.push(region);
		continue;
	}
	perRegion.push({ region, links });
}

/* ── resolve, asking the wiki about the titles the cache cannot settle ── */

// The local cache is not a faithful proxy for the wiki's own link resolution:
// it folds titles case-insensitively, while the wiki's redirects are not —
// [[Dragon's tooth]] redirects to *Dragon Tooth* (the item) even though a page
// named *Dragon's Tooth* (the scenery) exists. So every title that does not
// resolve against the cache is put to the wiki once (a couple of dozen, 1
// req/s) and its answer — the page the link really lands on — is what resolves
// it. That is how the eight regions naming [[Coal deposit]] reach the Coal Node
// the atlas actually carries.
const needsLookup = [
	...new Set(perRegion.flatMap((r) => r.links.map((l) => l.title))),
].filter(
	(title) => !resolveNodeId({ title, label: title }, { byLowerId, redirectOf }),
);
if (needsLookup.length && !offline) {
	for (const title of needsLookup) {
		try {
			const page = await fetchPage(title);
			apiResolved.set(title.toLowerCase(), page.title);
		} catch {
			/* not a page the wiki has — reported as unresolved below */
		}
	}
	readCache();
	const kept = Object.fromEntries(
		[...apiResolved].sort((a, b) => a[0].localeCompare(b[0])),
	);
	fs.writeFileSync(REDIRECTS, `${JSON.stringify(kept, null, 2)}\n`);
}

const { resolved, unresolved, skipped } = collectResources(
	perRegion,
	byLowerId,
	{
		redirectOf,
		kindOf: (id) => kindById.get(id),
	},
);

/* ── emit ───────────────────────────────────────────────────────── */

const sorted = {};
for (const region of CANON_REGIONS) {
	const members = resolved[region];
	if (!members) continue;
	sorted[region] = {};
	for (const item of Object.keys(members).sort((a, b) => a.localeCompare(b))) {
		sorted[region][item] = members[item].sort();
	}
}

const out = {
	source: "https://dragonwilds.runescape.wiki/w/Ashenfall",
	generatedAt: new Date().toISOString(),
	regions: sorted,
};

const header = `${[
	"// Region resources: generated by scripts/build-region-resources.mjs from each",
	"// region page's ==Resources== section — what is gathered where, as",
	"// { region: { itemId: [method, …] } }. The complement of found-in.js, which",
	"// reads the item pages instead. Overlay only: src/app.js folds it into the",
	"// region hubs at boot, data.json is untouched.",
	`window.DW_REGION_RESOURCES = ${JSON.stringify(out)};`,
].join("\n")}\n`;
fs.writeFileSync(path.join(ROOT, "public", "region-resources.js"), header);

/* ── report ─────────────────────────────────────────────────────── */

// how much of this is new next to the prose-mined found-in overlay the hubs
// already have — the number that says whether this source was worth mining
const ctx = {};
new Function(
	"window",
	fs.readFileSync(path.join(ROOT, "public", "found-in.js"), "utf8"),
)(ctx);
const existing = new Set();
for (const [item, list] of Object.entries(ctx.DW_FOUND_IN || {})) {
	for (const find of list) {
		if (find.region) existing.add(`${find.region}\u0000${item}`);
	}
}
let links = 0;
let fresh = 0;
for (const [region, members] of Object.entries(sorted)) {
	let regionNew = 0;
	for (const item of Object.keys(members)) {
		links++;
		if (!existing.has(`${region}\u0000${item}`)) {
			fresh++;
			regionNew++;
		}
	}
	console.log(
		`  ${region}: ${Object.keys(members).length} resources (${regionNew} new)`,
	);
}

const tally = (list) => {
	const counts = new Map();
	for (const value of list) counts.set(value, (counts.get(value) || 0) + 1);
	return [...counts]
		.sort((a, b) => b[1] - a[1])
		.map(([value, times]) => `${value} (×${times})`);
};

console.log(
	`\nwrote public/region-resources.js — ${Object.keys(sorted).length}/${CANON_REGIONS.length} regions, ${links} region→resource links (${fresh} new alongside found-in's ${existing.size})`,
);
if (noData.length)
	console.log(
		`no ==Resources== on the wiki (${noData.length}): ${noData.join(", ")}`,
	);
if (skipped.length)
	console.log(
		`skipped, not a resource (${skipped.length}): ${tally(skipped).join(", ")}`,
	);
if (unresolved.length) {
	console.log(
		`unresolved — scenery/lore pages the atlas has no node for (${new Set(unresolved).size}):`,
	);
	console.log(`  ${tally(unresolved).join(", ")}`);
}
