/* Pure logic for the live-map link artifact (scripts/build-map-links.mjs).

   Two jobs, both of them judgement calls that deserve to be testable without
   the 4.7 MB source file:

   1. Which atlas nodes answer to a marker type on the Wyrmwatch map. The atlas
      names its nodes the way the wiki does ("Iron Ore Node", "Rune Essence
      (Rock)", "Potato (plant)"); the map names its types the way the game files
      do (`iron`, `rune_essence_geyser`, `potato`). The rule below is
      deliberately exact — and then tolerant only about the tail words the wiki
      appends. A looser rule (substring, prefix) reads well until "Soul Stone"
      matches the `stone` type and sends a reader to 3,377 nodes that are not
      the one they asked about, so anything the rule cannot answer stays
      unlinked and is reported by the generator instead.

   2. Where to point the camera. The atlas has no coordinates; the map does, and
      its own view is `#view=<worldX>,<worldY>,<zoom>` (see src/map-links.js).
      The view baked here frames the marker type's OWN nodes: centre of their
      bounding box, zoom as tight as fits that box. A type spread across the
      whole world therefore lands on the map's widest view, and one with three
      veins in a corner lands on those three.

   The type universe is restricted to the groups that are things you go and
   gather. Quests, NPCs and mobs are excluded on purpose: they hold names the
   atlas also uses for something else (the `death` NPC against a spell) and a
   wrong pin is worse than no link. */

/** Marker groups that name something a player gathers, in the game's own taxonomy. */
export const LINK_GROUPS = new Set([
	"rock",
	"tree",
	"fishing",
	"gatherable",
	"poi",
]);

/** Tail words the wiki appends to a resource page title ("Iron Ore Node"). */
const TAIL_WORDS = /\b(?:node|deposit|rock|boulder|geyser|plant|spot|ore)\b/g;

/** Compare titles and type keys the same way: case, punctuation and spacing out. */
export const normalizeName = (name) =>
	String(name || "")
		.replace(/\([^)]*\)/g, "") // "Rune Essence (Rock)" — the disambiguator is wiki bookkeeping
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");

/* The map's world, read from its own wyrmwatch-map.js: `G = { x0: -12000,
   y0: -118550, w: 4200, h: 4200, uu: 100 }`. One Leaflet unit is uu metres, so
   the whole map is 4200 units across and a zoom of z shows W/2^z of them in a
   W-pixel viewport. Anything outside [x0, x0 + w·uu] is not on the map at all. */
export const WORLD = { x0: -12000, y0: -118550, w: 4200, h: 4200, uu: 100 };

/** Viewport the fit assumes, and the zoom band its own controls allow. */
const FIT = { width: 1100, height: 680, min: -3, max: 4 };

/**
 * One marker type, with the statistics the link needs.
 *
 * @typedef {object} MapType
 * @property {string} key the map's type key (`iron`)
 * @property {string} label its display name ("Iron")
 * @property {string} group rock | tree | fishing | gatherable | poi
 * @property {{x: number, y: number, layer: number}[]} points
 */

/**
 * The linkable types of a reference file, in the file's own group order.
 *
 * @param {object} reference the parsed wyrmwatch reference JSON
 * @returns {MapType[]}
 */
export function typeCatalogue(reference) {
	const out = [];
	for (const group of reference?.groups || []) {
		if (!LINK_GROUPS.has(group.key)) continue;
		// one label can cover several keys: the six `anima_vent_*` types are all
		// "Anima Vent" on the map, and all six are what one vent icon means
		for (const type of group.types || []) {
			out.push({
				key: type.key,
				label: type.label,
				group: group.key,
				points: [],
			});
		}
	}
	const byKey = new Map(out.map((t) => [t.key, t]));
	for (const p of reference?.points || []) {
		const type = byKey.get(p.type);
		if (!type) continue;
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
		type.points.push({ x: p.x, y: p.y, layer: p.layer === 1 ? 1 : 0 });
	}
	return out.filter((t) => t.points.length);
}

/**
 * The type keys an atlas node name answers to, or null when none does.
 *
 * Tried in order: the name as-is against every label (all matches, so the six
 * anima vents come back together), then against the keys, then with the wiki's
 * tail words removed ("Iron Ore Node" → "Iron").
 *
 * @param {string} name the atlas node's display name
 * @param {MapType[]} catalogue
 * @returns {string[]|null}
 */
export function resolveTypeKeys(name, catalogue) {
	const byLabel = new Map();
	const byKey = new Map();
	for (const type of catalogue) {
		const label = normalizeName(type.label);
		if (!byLabel.has(label)) byLabel.set(label, []);
		byLabel.get(label).push(type.key);
		if (!byKey.has(normalizeName(type.key)))
			byKey.set(normalizeName(type.key), [type.key]);
	}
	const exact = (raw) => {
		const key = normalizeName(raw);
		if (!key) return null;
		return byLabel.get(key) || byKey.get(key) || null;
	};
	// the tail words arrive capitalised ("Iron Ore Node"), so strip the lowercase
	// copy — normalizeName() is case-blind, but the \b in TAIL_WORDS is not
	return (
		exact(name) ||
		exact(
			String(name || "")
				.toLowerCase()
				.replace(TAIL_WORDS, " "),
		) ||
		null
	);
}

/**
 * The view that frames a set of points: the centre of their bounding box, and
 * the tightest zoom that fits it in a reader's window.
 *
 * A box too small to matter (one vein) is capped at FIT.max rather than zoomed
 * to the pixel, and a box wider than the world is capped at FIT.min — the map
 * clamps both ends again anyway (`Math.max(map.getMinZoom(), Math.min(7, …))`).
 *
 * @param {{x: number, y: number}[]} points
 * @returns {{x: number, y: number, zoom: number}}
 */
export function fitView(points) {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
	const y = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
	// the map is a fixed 4200-unit square: a box wider than it is not a frame,
	// and keeping the centre inside it stops a stray point from aiming off-map
	const width = (Math.max(...xs) - Math.min(...xs)) / WORLD.uu;
	const height = (Math.max(...ys) - Math.min(...ys)) / WORLD.uu;
	const fit = Math.min(
		Math.log2(FIT.width / Math.max(width, 1e-6)),
		Math.log2(FIT.height / Math.max(height, 1e-6)),
	);
	const zoom = Math.max(FIT.min, Math.min(FIT.max, fit));
	return {
		x: Math.max(WORLD.x0, Math.min(WORLD.x0 + WORLD.w * WORLD.uu, x)),
		y: Math.max(WORLD.y0, Math.min(WORLD.y0 + WORLD.h * WORLD.uu, y)),
		zoom: Math.round(zoom * 100) / 100,
	};
}

/** Every node of a type set on the plane the link will open. */
const pointsFor = (types, plane) =>
	types.flatMap((t) => t.points).filter((p) => p.layer === plane);

/**
 * The artifact behind public/map-links.js: which atlas node opens what.
 *
 * @param {object} options
 * @param {object} options.reference the parsed wyrmwatch reference JSON
 * @param {{id: string, name: string, kind: string}[]} options.nodes the dataset's nodes
 * @param {string} [options.sourceUrl] the map page a link opens
 * @param {string} [options.referenceUrl] the reference file it was generated from
 * @param {string} [options.snapshot] the reference's own snapshot date
 * @param {string} [options.sha256] digest of the reference file
 * @param {string} [options.attribution]
 * @returns {{artifact: object, report: object}}
 */
export function buildMapLinks({
	reference,
	nodes,
	sourceUrl,
	referenceUrl,
	snapshot,
	sha256,
	attribution,
}) {
	const catalogue = typeCatalogue(reference);
	const byKey = new Map(catalogue.map((t) => [t.key, t]));
	const entries = {};
	const usedKeys = new Set();
	const nodesById = new Map();

	for (const node of nodes) {
		if (!node || !node.id || nodesById.has(node.id)) continue;
		nodesById.set(node.id, node);
		const keys = resolveTypeKeys(node.name, catalogue);
		if (!keys) continue;
		const types = keys.map((k) => byKey.get(k)).filter(Boolean);
		if (types.length !== keys.length) continue;
		// only a type that exists ONLY underground opens underground: a type with
		// any surface pins belongs on the surface plane, where the map starts
		const allUnderground = types.every((t) => pointsFor([t], 0).length === 0);
		const plane = allUnderground ? 1 : 0;
		const points = pointsFor(types, plane);
		if (!points.length) continue;
		entries[node.id] = { keys, plane, view: fitView(points) };
		for (const k of keys) usedKeys.add(k);
	}

	const types = {};
	for (const key of [...usedKeys].sort()) {
		const type = byKey.get(key);
		types[key] = {
			label: type.label,
			group: type.group,
			count: type.points.length,
			plane: pointsFor([type], 0).length ? 0 : 1,
		};
	}

	const artifact = {
		source: {
			map: sourceUrl,
			reference: referenceUrl,
			snapshot,
			sha256,
			attribution,
		},
		types,
		nodes: entries,
	};

	// the generator's own report: coverage over the nodes a reader would look
	// for a location on, and the names the rule could not answer
	const resources = nodes.filter((n) => n && n.kind === "resource");
	const linked = resources.filter((n) => entries[n.id]);
	const report = {
		catalogue: catalogue.length,
		typesUsed: Object.keys(types).length,
		nodesLinked: Object.keys(entries).length,
		resources: { linked: linked.length, total: resources.length },
		unlinkedResources: resources
			.filter((n) => !entries[n.id])
			.map((n) => n.name)
			.sort(),
		pins: Object.values(types).reduce((n, t) => n + t.count, 0),
	};
	return { artifact, report };
}
