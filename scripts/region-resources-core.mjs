/* Pure logic for the region resource overlay (scripts/build-region-resources.mjs).
   Kept apart from the generator so the wikitext parsing and the title → node-id
   resolution can be unit-tested without the wiki cache or the dataset.

   Why this source exists: every region and territory page on the wiki carries a
   ==Resources== section listing what is gathered there. The found-in overlay
   mines the *item* pages instead, so it only knows a region's resources when an
   item's prose happens to name one — these pages are the other direction, and
   they are the only source for the territories no item ever mentions. */

/* Subsection header → the same gather-method vocabulary public/found-in.js uses
   (src/app.js renders it as a verb). The wiki uses two naming styles: the older
   pages split by what you gather from (Nodes / Plants / Trees / Fish), the
   Dragonkin-vault interiors by where it sits (Unique to region / Other
   resources / Loot). Headers we have never seen fall back to `other`, which the
   app prints as "found" — wrong-looking data is worse than vague data. */
export const METHOD_BY_HEADER = {
	nodes: "mined",
	plants: "picked",
	trees: "chopped",
	fish: "caught",
	chests: "chest",
	loot: "chest",
	other: "other",
	"other resources": "other",
	"unique to region": "other",
};

/** The gather method a Resources subsection header implies. */
export const methodForHeader = (header) =>
	METHOD_BY_HEADER[String(header).trim().toLowerCase().replace(/\s+/g, " ")] ||
	"other";

/** Headers/links we never resolve: [[File:…]] and [[Category:…]] are markup, not resources. */
const NAMESPACE = /^(file|image|category|template|special|help|media):/i;

/** Header text without its links or markup: "[[Chest]]s" → "Chests". */
export const headerText = (header) =>
	String(header)
		.replace(
			/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
			(_, target, label) => label || target,
		)
		.replace(/<[^>]*>/g, "")
		.replace(/'''?/g, "")
		.replace(/\s+/g, " ")
		.trim();

/** Every [[Target|Label]] on a line, in order; labels default to the target. */
export function linksIn(line) {
	return [...String(line).matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)]
		.map((m) => ({ title: m[1].trim(), label: (m[2] || m[1]).trim() }))
		.filter(
			(l) => l.title && !NAMESPACE.test(l.title) && !l.title.startsWith("#"),
		);
}

/**
 * Does the page carry a ==Resources== heading at all? The generator needs this
 * apart from the links it yields: a page with no heading is a **stub** the wiki
 * has not written yet, which is a different fact from a page whose bullets
 * happen to hold nothing the atlas can use, and only the first one lets the
 * codex say why a hub is empty.
 *
 * @param {string} wikitext the whole page
 * @returns {boolean}
 */
export const hasResourcesSection = (wikitext) =>
	/==\s*Resources\s*==/.test(String(wikitext));

/**
 * Split the canonical regions by what their pages gave us, in display order:
 * `stubs` are pages with no ==Resources== heading at all, `unknown` are pages
 * the cache does not have and the network could not supply. Everything else
 * contributed members — or had a heading whose links none of them resolved.
 *
 * Kept pure and separate from the generator so the Gherkin suite can check the
 * distinction without a wiki cache: the two are reported differently (a stub is
 * stated in the hub's codex, an unknown page never is) and only the stub is
 * ever claimed as "the wiki has not written this yet".
 *
 * @param {string[]} canonRegions the canonical list, in display order
 * @param {Map<string, string|null>} wikitextByRegion page text per region (null = no page)
 * @returns {{ stubs: string[], unknown: string[] }}
 */
export function splitRegionPages(canonRegions, wikitextByRegion) {
	const stubs = [];
	const unknown = [];
	for (const region of canonRegions) {
		const wikitext = wikitextByRegion.get(region);
		if (wikitext == null) unknown.push(region);
		else if (!hasResourcesSection(wikitext)) stubs.push(region);
	}
	return { stubs, unknown };
}

/**
 * The ==Resources== section of a region page, as a flat list of link records.
 * Handles both header levels the wiki mixes (`===Nodes===` and
 * `====Loot====`), nested bullets, and the `{{*}}` separator templates that sit
 * between two links on one line. Lines that are not bullets (prose, tables,
 * the trailing nav template) contribute nothing.
 *
 * @typedef {{ section: string, method: string, title: string, label: string }} ResourceLink
 * @param {string} wikitext the whole page
 * @returns {ResourceLink[]}
 */
export function parseResources(wikitext) {
	const section = /==\s*Resources\s*==([\s\S]*?)(?=\n==[^=]|$)/.exec(
		String(wikitext),
	);
	if (!section) return [];
	const out = [];
	// split on level-3 or level-4 headings; parts alternate [prose, header, body, …]
	const parts = section[1].split(/\n={3,4}\s*([^=\n]+?)\s*={3,4}\s*\n/);
	for (let i = 1; i < parts.length; i += 2) {
		const header = headerText(parts[i]);
		const method = methodForHeader(header);
		for (const line of (parts[i + 1] || "").split("\n")) {
			if (!/^\s*\*/.test(line)) continue;
			for (const link of linksIn(line))
				out.push({ section: header, method, ...link });
		}
	}
	return out;
}

/** Page titles are space-normalised and underscore-insensitive on the wiki. */
const normalize = (title) =>
	String(title || "")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim();

/** "Rune Essence (Rock)" → "Rune Essence"; the disambiguator is wiki bookkeeping. */
const withoutParen = (title) =>
	normalize(title)
		.replace(/\s*\([^)]*\)\s*$/, "")
		.trim();

/**
 * Resolve one wiki link to an atlas node id, or null.
 *
 * The link target wins over its display label — labels are prose ("Treasure
 * chest", "Salvage") while targets are page titles, and the dataset's ids come
 * from page titles. Both are tried with and without a trailing disambiguator,
 * then through one wiki redirect hop: `[[Coal deposit]]` is the wiki's own
 * redirect to *Coal Node*, which is the node the atlas actually carries.
 *
 * @param {{ title: string, label: string }} link
 * @param {{ byLowerId: Map<string, string>, redirectOf?: (title: string) => string|null }} index
 * @returns {string|null}
 */
export function resolveNodeId(link, index) {
	const { byLowerId, redirectOf } = index;
	for (const raw of [link.title, link.label]) {
		for (const candidate of [normalize(raw), withoutParen(raw)]) {
			if (!candidate) continue;
			const direct = byLowerId.get(candidate.toLowerCase());
			if (direct) return direct;
		}
	}
	if (!redirectOf) return null;
	for (const raw of [link.title, link.label]) {
		const redirected = redirectOf(normalize(raw));
		if (!redirected) continue;
		for (const candidate of [normalize(redirected), withoutParen(redirected)]) {
			const hit = byLowerId.get(candidate.toLowerCase());
			if (hit) return hit;
		}
	}
	return null;
}

/**
 * Fold parsed links into `{ region: { nodeId: [method, …] } }`, dropping
 * anything that does not resolve or is not a resource-ish node.
 *
 * Regions and quests are excluded on purpose: the story spine already draws
 * those spokes, so a Resources bullet that names one (Fellhollow appears as a
 * *location* on some pages, and [[Dragon Slayer]] as a quest) would just double
 * the edge under a "found here" label that would be a lie.
 *
 * @typedef {{ region: string, links: ResourceLink[] }} RegionResources
 * @param {RegionResources[]} regions
 * @param {Map<string, string>} byLowerId
 * @param {object} [options]
 * @param {(title: string) => string|null} [options.redirectOf] one wiki redirect hop
 * @param {(nodeId: string) => string|null} [options.kindOf] the node's kind, for the kind skip
 * @param {Set<string>} [options.skipKinds] kinds that are not a resource (default region/quest/mount/skill/implicit)
 * @returns {{ resolved: Record<string, Record<string, string[]>>, unresolved: string[], skipped: string[] }}
 */
export function collectResources(regions, byLowerId, options = {}) {
	const {
		redirectOf,
		skipKinds = new Set(["region", "quest", "mount", "skill", "implicit"]),
	} = options;
	const kindOf = options.kindOf || (() => null);
	const resolved = {};
	const unresolved = [];
	const skipped = [];
	for (const { region, links } of regions) {
		for (const link of links) {
			const id = resolveNodeId(link, { byLowerId, redirectOf });
			if (!id) {
				unresolved.push(link.title);
				continue;
			}
			if (skipKinds.has(kindOf(id))) {
				skipped.push(`${id} [${kindOf(id)}]`);
				continue;
			}
			if (!resolved[region]) resolved[region] = {};
			const members = resolved[region];
			if (!members[id]) members[id] = [];
			const methods = members[id];
			if (!methods.includes(link.method)) methods.push(link.method);
		}
	}
	return { resolved, unresolved, skipped };
}
