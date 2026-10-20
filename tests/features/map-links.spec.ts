/**
 * Cucumber/Gherkin spec for the live map links (scripts/build-map-links.mjs →
 * public/map-links.js, read by src/map-links.js).
 *
 * Both halves are pure and both are driven here: the join and the view fit in
 * scripts/map-links-core.mjs, and the hash the runtime builds out of one
 * artifact entry in src/map-links.js — which is imported for real, with a
 * stand-in `window`, rather than mirrored, so a test can never pass against a
 * copy of the format. The generator adds only the cache and the network, and
 * the panel button is covered by the `maplinks` checks in scripts/test-ui.mjs.
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as
 * fn(ctx, ...params), so parameterized steps ({string}/{int}) declare a _ctx
 * placeholder as the first argument.
 */

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { buildMapLinks, typeCatalogue } from "../../scripts/map-links-core.mjs";
import { mapHash, mapLinkFor } from "../../src/map-links.js";

interface RefType {
	key: string;
	label: string;
}
interface RefGroup {
	key: string;
	label: string;
	types: RefType[];
}
interface RefPoint {
	type: string;
	x: number;
	y: number;
	layer: number;
}
interface AtlasNode {
	id: string;
	name: string;
	kind: string;
}
interface Built {
	artifact: {
		source: {
			map: string;
			reference: string;
			snapshot: string;
			sha256: string;
		};
		types: Record<
			string,
			{ label: string; group: string; count: number; plane: number }
		>;
		nodes: Record<
			string,
			{
				keys: string[];
				plane: number;
				view: { x: number; y: number; zoom: number };
			}
		>;
	};
	report: {
		catalogue: number;
		typesUsed: number;
		nodesLinked: number;
		resources: { linked: number; total: number };
		unlinkedResources: string[];
		pins: number;
	};
}

const MAP_URL =
	"https://www.survivalservers.com/share/runescape-dragonwilds/wyrmwatch/ashenfall";

let groups: RefGroup[];
let points: RefPoint[];
let nodes: AtlasNode[];
let built: Built | null = null;
let catalogue: ReturnType<typeof typeCatalogue>;

/** The map's own type registry: the background appends to it, keyed by group. */
const drawType = (group: string, key: string, label: string) => {
	let g = groups.find((x) => x.key === group);
	if (!g) {
		g = { key: group, label: group, types: [] };
		groups.push(g);
	}
	if (!g.types.some((t) => t.key === key)) g.types.push({ key, label });
};

const markers = (type: string, coords: string, layer = 0) => {
	const [x, y] = coords.split(",").map((n) => Number(n.trim()));
	points.push({ type, x, y, layer });
};

/** The whole pipeline, the way the generator runs it. */
function join() {
	built = buildMapLinks({
		reference: { groups, points, snapshot: "2026-09-14" },
		nodes,
		sourceUrl: MAP_URL,
		referenceUrl: "https://example.invalid/wyrmwatch-reference.json",
		snapshot: "2026-09-14",
		sha256: "0".repeat(64),
		attribution: "test",
	}) as unknown as Built;
	catalogue = typeCatalogue({ groups, points });
}

/** Exercise the real runtime module against the artifact just built. */
const withWindow = () => {
	Object.assign(globalThis, {
		window: { DW_MAP_LINKS: (built as Built).artifact },
	});
};

const entry = (id: string) => (built as Built).artifact.nodes[id];

const opensTypes = (_ctx: unknown, id: string, keys: string) => {
	expect(entry(id)?.keys.join(",")).toBe(keys);
};

const opensNothing = (_ctx: unknown, id: string) => {
	expect(entry(id)).toBeUndefined();
};

const feature = await loadFeature("./map-links.feature");

describeFeature(feature, ({ Background, Scenario }) => {
	Background(({ Given }) => {
		// the whole canned reference in one step, reset included: the plugin runs
		// one test per step, so per-scenario state is set up here (as the other
		// feature specs do) rather than in a beforeEach — a beforeEach would fire
		// between two steps of the same scenario and wipe what the last one built.
		// The scenarios below add the deltas they are actually about (an unmarked
		// type, a stray far-away marker, …).
		Given(
			"a map drawing Iron, Stone, Ash Tree, Anima Vent, Death and Coal, and the atlas nodes gathered from them",
			() => {
				groups = [];
				points = [];
				nodes = [];
				built = null;
				catalogue = [];
				drawType("rock", "iron", "Iron");
				drawType("rock", "stone", "Stone");
				drawType("tree", "ash_tree", "Ash Tree");
				drawType("poi", "anima_vent_air", "Anima Vent");
				drawType("poi", "anima_vent_fire", "Anima Vent");
				drawType("npc", "death", "Death");
				drawType("rock", "coal", "Coal");
				markers("iron", "0,0");
				markers("iron", "20000,20000");
				markers("stone", "0,0");
				markers("stone", "400,400");
				markers("ash_tree", "1000,1000");
				markers("ash_tree", "1010,1010");
				markers("anima_vent_air", "500,500");
				markers("anima_vent_fire", "600,600");
				markers("death", "10,10");
				markers("coal", "300,300", 1);
				for (const [name, kind] of [
					["Iron Ore Node", "resource"],
					["Stone Boulder", "resource"],
					["Soul Stone", "material"],
					["Ash Tree", "resource"],
					["Anima Vent", "resource"],
					["Coal Node", "resource"],
					["Death", "spell"],
				])
					nodes.push({ id: name, name, kind });
			},
		);
	});

	Scenario(
		"A wiki title answers to the map's marker type",
		({ When, Then, And }) => {
			When("the atlas is joined to the map", join);
			Then("{string} opens the marker types {string}", opensTypes);
			And("{string} opens the marker types {string}", opensTypes);
		},
	);

	Scenario(
		"One label covering several keys comes back whole",
		({ When, Then }) => {
			When("the atlas is joined to the map", join);
			Then("{string} opens the marker types {string}", opensTypes);
		},
	);

	Scenario(
		"A name the rule cannot answer is left unlinked rather than guessed",
		({ When, Then, And }) => {
			When("the atlas is joined to the map", join);
			Then("{string} opens no marker type", opensNothing);
			And("{string} opens the marker types {string}", opensTypes);
		},
	);

	Scenario(
		"A type the atlas does not gather from is never offered",
		({ When, Then }) => {
			When("the atlas is joined to the map", join);
			Then("{string} opens no marker type", opensNothing);
		},
	);

	Scenario(
		"A type with no markers of its own is not in the catalogue",
		({ Given, When, Then, And }) => {
			Given(
				"the map draws the {string} type {string} labelled {string}",
				(_ctx, group: string, key: string, label: string) =>
					drawType(group, key, label),
			);
			// the feature line is an "And", and the plugin keys a step on its
			// connector as well as its text — the same wording registered as a Given
			// is a different step to it
			And(
				"an atlas node {string} of kind {string}",
				(_ctx, name: string, kind: string) => {
					nodes.push({ id: name, name, kind });
				},
			);
			When("the atlas is joined to the map", join);
			Then("the catalogue holds no type {string}", (_ctx, key: string) => {
				expect(catalogue.some((t) => t.key === key)).toBe(false);
			});
			And("{string} opens no marker type", opensNothing);
		},
	);

	Scenario(
		"A type that only exists underground opens the underground plane",
		({ When, Then, And }) => {
			When("the atlas is joined to the map", join);
			Then("{string} opens the underground plane", (_ctx, id: string) => {
				expect(entry(id)?.plane).toBe(1);
			});
			And("{string} opens the surface plane", (_ctx, id: string) => {
				expect(entry(id)?.plane).toBe(0);
			});
		},
	);

	Scenario(
		"The view frames the markers of the node's own types",
		({ When, Then, And }) => {
			When("the atlas is joined to the map", join);
			Then(
				"the view for {string} is centred at {string}",
				(_ctx, id: string, centre: string) => {
					const [x, y] = centre.split(",").map(Number);
					expect(entry(id)?.view.x).toBe(x);
					expect(entry(id)?.view.y).toBe(y);
				},
			);
			And(
				"the view for {string} is tighter than the view for {string}",
				(_ctx, tight: string, wide: string) => {
					expect(entry(tight)?.view.zoom).toBeGreaterThan(
						entry(wide)?.view.zoom as number,
					);
				},
			);
		},
	);

	Scenario(
		"The view stays inside the map it describes",
		({ Given, When, Then }) => {
			Given(
				"the {string} type has one marker at {string}",
				(_ctx, type: string, coords: string) => markers(type, coords),
			);
			When("the atlas is joined to the map", join);
			Then(
				"the view for {string} is inside the map's world",
				(_ctx, id: string) => {
					const view = entry(id)?.view as {
						x: number;
						y: number;
						zoom: number;
					};
					expect(view.x).toBeGreaterThanOrEqual(-12000);
					expect(view.x).toBeLessThanOrEqual(408000);
					expect(view.y).toBeGreaterThanOrEqual(-118550);
					expect(view.y).toBeLessThanOrEqual(301450);
					// …and still a zoom the map's own controls can be given
					expect(view.zoom).toBeGreaterThanOrEqual(-3);
					expect(view.zoom).toBeLessThanOrEqual(7);
				},
			);
		},
	);

	Scenario("The artifact only names what it carries", ({ When, Then }) => {
		When("the atlas is joined to the map", join);
		Then("every linked node filters on a type the artifact carries", () => {
			const b = built as Built;
			for (const [id, e] of Object.entries(b.artifact.nodes)) {
				expect(e.keys.length, id).toBeGreaterThan(0);
				for (const key of e.keys)
					expect(b.artifact.types[key], `${id} → ${key}`).toBeTruthy();
			}
		});
	});

	Scenario(
		"The report accounts for the nodes a reader would ask about",
		({ Given, When, Then, And }) => {
			Given(
				"an atlas node {string} of kind {string}",
				(_ctx, name: string, kind: string) => {
					nodes.push({ id: name, name, kind });
				},
			);
			When("the atlas is joined to the map", join);
			Then("the report reaches {string} resources", (_ctx, counts: string) => {
				const r = (built as Built).report.resources;
				expect(`${r.linked} of ${r.total}`).toBe(counts);
			});
			And(
				"the report lists {string} as having no counterpart",
				(_ctx, name: string) => {
					expect((built as Built).report.unlinkedResources).toContain(name);
				},
			);
		},
	);

	Scenario(
		"The link is a hash with a view, because a filter alone is read nowhere",
		({ When, Then }) => {
			When("the atlas is joined to the map", join);
			Then(
				"the link for {string} is {string}",
				(_ctx, id: string, hash: string) => {
					withWindow();
					expect(mapLinkFor(id)?.href).toBe(MAP_URL + hash);
					expect(mapHash(entry(id) as never)).toBe(hash);
				},
			);
		},
	);

	Scenario(
		"An underground link carries the level parameter",
		({ When, Then }) => {
			When("the atlas is joined to the map", join);
			Then(
				"the link for {string} is {string}",
				(_ctx, id: string, hash: string) => {
					withWindow();
					expect(mapLinkFor(id)?.href).toBe(MAP_URL + hash);
				},
			);
		},
	);

	Scenario(
		"A node the artifact does not mention gets no link",
		({ When, Then }) => {
			When("the atlas is joined to the map", join);
			Then("{string} gets no link", (_ctx, id: string) => {
				withWindow();
				expect(mapLinkFor(id)).toBeNull();
			});
		},
	);
});
