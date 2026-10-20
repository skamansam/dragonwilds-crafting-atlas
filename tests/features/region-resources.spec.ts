/**
 * Cucumber/Gherkin spec for the region resource overlay (scripts/build-region-resources.mjs).
 * Drives the pure half in scripts/region-resources-core.mjs — the wikitext
 * parsing and the title → node-id resolution. The generator only adds the wiki
 * cache and the network; the app side is covered by the `quests` checks in
 * scripts/test-ui.mjs and the counts by scripts/check-sources.mjs.
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as
 * fn(ctx, ...params), so parameterized steps ({string}/{int}) declare a _ctx
 * placeholder as the first argument.
 */

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	collectResources,
	parseRegionHierarchy,
	parseResources,
	resolveNodeId,
	splitRegionPages,
} from "../../scripts/region-resources-core.mjs";

// The canonical regions the hierarchy scenarios are read against: two divisions
// and the regions they hold, plus one region no division names.
const CANON_REGIONS = [
	"Brynmoor",
	"Ghornfell",
	"Temple Woods",
	"Bramblemead Valley",
	"Fractured Plains",
];

interface ResourceLink {
	section: string;
	method: string;
	title: string;
	label: string;
}

interface Collected {
	resolved: Record<string, Record<string, string[]>>;
	unresolved: string[];
	skipped: string[];
}

interface Section {
	header: string;
	level: number;
	lines: string[];
}

const feature = await loadFeature("./region-resources.feature");

let nodes: Map<string, string>; // lowercased id → id
let kinds: Map<string, string>; // id → kind
let redirects: Map<string, string>; // lowercased title → the title it leads to
let sections: Section[];
let noResourcesSection: boolean;
let links: ResourceLink[];
let asked: Array<{ region: string; links: ResourceLink[] }>;
let collected: Collected;
let stubs: string[];
let unknown: string[];
let geoBlocks: Array<{ head: string; bullets: string[] }>; // the Ashenfall page's ==Geography==
let worldSections: Section[]; // …and any other section of that same page
let hierarchy: { divisions: Record<string, string[]>; unmatched: string[] };

const byLowerId = () => new Map(nodes);
const redirectOf = (title: string) =>
	redirects.get(title.toLowerCase()) || null;
const kindOf = (id: string) => kinds.get(id) || null;

/** The section for `header`, created on demand so a second step can add to it. */
const section = (header: string, level = 3): Section => {
	let found = sections.find((s) => s.header === header);
	if (!found) {
		found = { header, level, lines: [] };
		sections.push(found);
	}
	return found;
};

/** The whole page: prose, then ==Resources== with its subsections. */
const page = () => {
	if (noResourcesSection)
		return "'''Temple Woods''' is an area in [[Ashenfall]].\n";
	const body = sections
		.map((s) => {
			const bars = "=".repeat(s.level);
			return `${bars}${s.header}${bars}\n${s.lines.join("\n")}\n`;
		})
		.join("");
	return `'''Temple Woods''' is an area in [[Ashenfall]].\n\n==Description==\nA cliff.\n\n==Resources==\n${body}\n==Monsters==\n* [[Chicken]]\n`;
};

const link = (title: string) => links.find((l) => l.title === title);

/** The block for `head`, created on demand so a second step can add to it. */
const geoBlock = (head: string) => {
	let found = geoBlocks.find((b) => b.head === head);
	if (!found) {
		found = { head, bullets: [] };
		geoBlocks.push(found);
	}
	return found;
};

/** A non-Geography section of the Ashenfall page (==Inhabitants== and friends). */
const worldSection = (header: string): Section => {
	let found = worldSections.find((s) => s.header === header);
	if (!found) {
		found = { header, level: 2, lines: [] };
		worldSections.push(found);
	}
	return found;
};

/** The Ashenfall page: its Geography block, then whatever else was added. */
const worldPage = () => {
	const geo = geoBlocks.length
		? `==Geography==\n${geoBlocks.map((b) => `${b.head}\n${b.bullets.join("\n")}`).join("\n")}\n`
		: "";
	const rest = worldSections
		.map((s) => `==${s.header}==\n${s.lines.join("\n")}\n`)
		.join("");
	return `'''Ashenfall''' is the island.\n\n${geo}\n${rest}`;
};

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		// the atlas every scenario is read against — a tree with its logs, and an
		// ore node, so the case/underscore, disambiguator and redirect scenarios
		// all have something real to land on
		Given("the atlas holds a tree, its logs and a coal node", () => {
			nodes = new Map();
			kinds = new Map();
			redirects = new Map();
			sections = [];
			noResourcesSection = false;
			links = [];
			asked = [];
			collected = { resolved: {}, unresolved: [], skipped: [] };
			stubs = [];
			unknown = [];
			geoBlocks = [];
			worldSections = [];
			hierarchy = { divisions: {}, unmatched: [] };
			for (const [id, kind] of [
				["Ash Tree", "resource"],
				["Ash Logs", "material"],
				["Coal Node", "resource"],
			]) {
				nodes.set(id.toLowerCase(), id);
				kinds.set(id, kind);
			}
		});
	});

	Scenario(
		"A page's Resources list becomes members with a gather method",
		({ Given, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When("the region's resources are parsed", () => {
				links = parseResources(page());
			});
			Then(
				"the link {string} is a {string} resource",
				(_ctx, title: string, method: string) => {
					expect(link(title)?.method).toBe(method);
				},
			);
		},
	);

	Scenario(
		"The headers the vault interiors use count too",
		({ Given, When, Then }) => {
			Given(
				"a region page whose {string} section is one level deeper and lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header, 4).lines.push(`* ${entry}`);
				},
			);
			When("the region's resources are parsed", () => {
				links = parseResources(page());
			});
			Then(
				"the link {string} is a {string} resource",
				(_ctx, title: string, method: string) => {
					expect(link(title)?.method).toBe(method);
				},
			);
		},
	);

	Scenario(
		"An unfamiliar header falls back to found rather than guessing",
		({ Given, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When("the region's resources are parsed", () => {
				links = parseResources(page());
			});
			Then(
				"the link {string} is a {string} resource",
				(_ctx, title: string, method: string) => {
					expect(link(title)?.method).toBe(method);
				},
			);
		},
	);

	Scenario(
		"Prose and templates under a header contribute nothing",
		({ Given, And, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			And(
				"the line {string} sits under {string}",
				(_ctx, line: string, header: string) => {
					section(header).lines.push(line);
				},
			);
			When("the region's resources are parsed", () => {
				links = parseResources(page());
			});
			Then("the page yields {int} links", (_ctx, count: number) => {
				expect(links.length).toBe(count);
			});
		},
	);

	Scenario("Markup links are not resources", ({ Given, And, When, Then }) => {
		Given(
			"a region page whose {string} section lists {string}",
			(_ctx, header: string, entry: string) => {
				section(header).lines.push(`* ${entry}`);
			},
		);
		And(
			"the line {string} sits under {string}",
			(_ctx, line: string, header: string) => {
				section(header).lines.push(line);
			},
		);
		When("the region's resources are parsed", () => {
			links = parseResources(page());
		});
		Then("the page yields {int} links", (_ctx, count: number) => {
			expect(links.length).toBe(count);
		});
	});

	Scenario(
		"Two links on one bullet both count, and a piped link keeps its page",
		({ Given, And, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			And(
				"the bullet {string} sits under {string}",
				(_ctx, line: string, header: string) => {
					section(header).lines.push(`* ${line}`);
				},
			);
			When("the region's resources are parsed", () => {
				links = parseResources(page());
			});
			Then("the page yields {int} links", (_ctx, count: number) => {
				expect(links.length).toBe(count);
			});
			And(
				"the link {string} is its own page with the label {string}",
				(_ctx, title: string, label: string) => {
					const found = link(title);
					expect(found?.title).toBe(title);
					expect(found?.label).toBe(label);
				},
			);
		},
	);

	Scenario(
		"A page with no Resources section contributes no members",
		({ Given, When, Then }) => {
			Given("a region page with no Resources section", () => {
				noResourcesSection = true;
			});
			When("the region's resources are parsed", () => {
				links = parseResources(page());
			});
			Then("the page yields {int} links", (_ctx, count: number) => {
				expect(links.length).toBe(count);
			});
		},
	);

	Scenario(
		"Case and underscores do not decide a match",
		({ Given, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then(
				"{string} resolves to {string}",
				(_ctx, title: string, id: string) => {
					expect(
						resolveNodeId(
							{ title, label: title },
							{ byLowerId: byLowerId(), redirectOf },
						),
					).toBe(id);
				},
			);
		},
	);

	Scenario(
		"A disambiguated page title resolves to the node behind it",
		({ Given, And, When, Then }) => {
			Given(
				"an atlas holding {string} of kind {string}",
				(_ctx, id: string, kind: string) => {
					nodes.set(id.toLowerCase(), id);
					kinds.set(id, kind);
				},
			);
			And(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then(
				"{string} resolves to {string}",
				(_ctx, title: string, id: string) => {
					expect(
						resolveNodeId(
							{ title, label: title },
							{ byLowerId: byLowerId(), redirectOf },
						),
					).toBe(id);
				},
			);
		},
	);

	Scenario(
		"The page title beats the display label",
		({ Given, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then(
				"{string} resolves to {string}",
				(_ctx, title: string, id: string) => {
					expect(
						resolveNodeId(
							{ title, label: title },
							{ byLowerId: byLowerId(), redirectOf },
						),
					).toBe(id);
				},
			);
		},
	);

	Scenario(
		"A wiki redirect resolves to the node it points at",
		({ Given, And, When, Then }) => {
			Given(
				"the wiki redirects {string} to {string}",
				(_ctx, from: string, to: string) => {
					redirects.set(from.toLowerCase(), to);
				},
			);
			And(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then(
				"{string} resolves to {string}",
				(_ctx, title: string, id: string) => {
					expect(
						resolveNodeId(
							{ title, label: title },
							{ byLowerId: byLowerId(), redirectOf },
						),
					).toBe(id);
				},
			);
		},
	);

	Scenario(
		"A link the atlas has no node for is reported, never invented",
		({ Given, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then("{string} is reported unresolved", (_ctx, title: string) => {
				expect(collected.unresolved).toContain(title);
				expect(
					Object.values(collected.resolved).flatMap((r) => Object.keys(r)),
				).not.toContain(title);
			});
		},
	);

	Scenario(
		"A link to a quest is skipped, not drawn as a find",
		({ Given, And, When, Then }) => {
			Given(
				"an atlas holding {string} of kind {string}",
				(_ctx, id: string, kind: string) => {
					nodes.set(id.toLowerCase(), id);
					kinds.set(id, kind);
				},
			);
			And(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then(
				"{string} is skipped as a {string}",
				(_ctx, id: string, kind: string) => {
					expect(collected.skipped.some((s) => s.startsWith(id))).toBe(true);
					expect(kindOf(id)).toBe(kind);
					expect(
						Object.values(collected.resolved).flatMap((r) => Object.keys(r)),
					).not.toContain(id);
				},
			);
		},
	);

	Scenario(
		"The same item in two sections carries both gather methods",
		({ Given, And, When, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			And(
				"the bullet {string} sits under {string}",
				(_ctx, line: string, header: string) => {
					section(header).lines.push(`* ${line}`);
				},
			);
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then(
				"{string} holds {string} with the methods {string}",
				(_ctx, region: string, item: string, methods: string) => {
					expect(
						[...(collected.resolved[region]?.[item] || [])].sort(),
					).toEqual(methods.split(",").sort());
				},
			);
		},
	);

	Scenario(
		"A page with no Resources heading is a stub, a page we could not read is unknown",
		({ Given, When, Then, And }) => {
			Given("a region page with no Resources section", () => {
				noResourcesSection = true;
			});
			When("the canonical regions are split by their pages", () => {
				// Temple Woods read fine (its heading is missing), The Burning Spire's
				// page was never obtained — the two must not be confused
				const pages = new Map<string, string | null>([
					["Temple Woods", page()],
					["The Burning Spire", null],
				]);
				({ stubs, unknown } = splitRegionPages(
					["Temple Woods", "The Burning Spire"],
					pages,
				));
			});
			Then("the stub pages are {string}", (_ctx, list: string) => {
				expect(stubs.join(", ")).toBe(list);
			});
			And("the unknown pages are {string}", (_ctx, list: string) => {
				expect(unknown.join(", ")).toBe(list);
			});
		},
	);

	Scenario(
		"A page that has the heading is never a stub, however little it resolves",
		({ Given, When, Then, And }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			When("the canonical regions are split by their pages", () => {
				// The Nexus in the real data: a heading whose only link resolves to
				// nothing. Stating "the wiki has not written this page" there would be
				// a lie, so the split must leave it out of `stubs`
				({ stubs, unknown } = splitRegionPages(
					["Temple Woods"],
					new Map([["Temple Woods", page()]]),
				));
			});
			Then("the stub pages are {string}", (_ctx, list: string) => {
				expect(stubs.join(", ")).toBe(list);
			});
			And("the unknown pages are {string}", (_ctx, list: string) => {
				expect(unknown.join(", ")).toBe(list);
			});
		},
	);

	Scenario(
		"The Geography section names the regions a division is made of",
		({ Given, When, Then, And }) => {
			Given(
				"an Ashenfall page whose Geography section puts {string} under {string}",
				(_ctx, child: string, division: string) => {
					geoBlock(`===\u005b\u005b${division}\u005d\u005d===`).bullets.push(
						`* \u005b\u005b${child}\u005d\u005d`,
					);
				},
			);
			And(
				"that section puts {string} under {string}",
				(_ctx, child: string, division: string) => {
					geoBlock(`===\u005b\u005b${division}\u005d\u005d===`).bullets.push(
						`* \u005b\u005b${child}\u005d\u005d`,
					);
				},
			);
			When("the sub-region hierarchy is parsed", () => {
				hierarchy = parseRegionHierarchy(worldPage(), CANON_REGIONS);
			});
			Then(
				"{string} holds the sub-regions {string}",
				(_ctx, division: string, list: string) => {
					expect((hierarchy.divisions[division] || []).join(", ")).toBe(list);
				},
			);
			And("the hierarchy holds {int} divisions", (_ctx, count: number) => {
				expect(Object.keys(hierarchy.divisions).length).toBe(count);
			});
		},
	);

	Scenario(
		"A heading that names no canonical region ends the block",
		({ Given, When, Then, And }) => {
			Given(
				"an Ashenfall page whose Geography section puts {string} under {string}",
				(_ctx, child: string, division: string) => {
					geoBlock(`===\u005b\u005b${division}\u005d\u005d===`).bullets.push(
						`* \u005b\u005b${child}\u005d\u005d`,
					);
				},
			);
			And(
				"the Geography section has an unnamed heading {string} listing {string}",
				(_ctx, heading: string, entry: string) => {
					geoBlock(`===${heading}===`).bullets.push(`* \u005b\u005b${entry}\u005d\u005d`);
				},
			);
			When("the sub-region hierarchy is parsed", () => {
				hierarchy = parseRegionHierarchy(worldPage(), CANON_REGIONS);
			});
			Then(
				"{string} holds the sub-regions {string}",
				(_ctx, division: string, list: string) => {
					expect((hierarchy.divisions[division] || []).join(", ")).toBe(list);
				},
			);
			And("{string} is reported as unmatched", (_ctx, name: string) => {
				expect(hierarchy.unmatched).toContain(name);
			});
			And("the hierarchy holds {int} divisions", (_ctx, count: number) => {
				expect(Object.keys(hierarchy.divisions).length).toBe(count);
			});
		},
	);

	Scenario(
		"Only the Geography section is read, so an Inhabitants list is not regions",
		({ Given, When, Then, And }) => {
			Given(
				"an Ashenfall page whose Geography section puts {string} under {string}",
				(_ctx, child: string, division: string) => {
					geoBlock(`===\u005b\u005b${division}\u005d\u005d===`).bullets.push(
						`* \u005b\u005b${child}\u005d\u005d`,
					);
				},
			);
			And(
				"the page's {string} section puts {string} under {string}",
				(_ctx, header: string, child: string, division: string) => {
					const s = worldSection(header);
					s.lines.push(`===\u005b\u005b${division}\u005d\u005d===`, `* \u005b\u005b${child}\u005d\u005d`);
				},
			);
			When("the sub-region hierarchy is parsed", () => {
				hierarchy = parseRegionHierarchy(worldPage(), CANON_REGIONS);
			});
			Then("the hierarchy holds {int} divisions", (_ctx, count: number) => {
				expect(Object.keys(hierarchy.divisions).length).toBe(count);
			});
			And("{string} holds no sub-regions", (_ctx, division: string) => {
				expect(hierarchy.divisions[division] || []).toEqual([]);
			});
		},
	);

	Scenario(
		"A sub-region the canonical list does not carry is reported, never invented",
		({ Given, When, Then, And }) => {
			Given(
				"an Ashenfall page whose Geography section puts {string} under {string}",
				(_ctx, child: string, division: string) => {
					geoBlock(`===\u005b\u005b${division}\u005d\u005d===`).bullets.push(
						`* \u005b\u005b${child}\u005d\u005d`,
					);
				},
			);
			When("the sub-region hierarchy is parsed", () => {
				hierarchy = parseRegionHierarchy(worldPage(), CANON_REGIONS);
			});
			Then("{string} holds no sub-regions", (_ctx, division: string) => {
				expect(hierarchy.divisions[division] || []).toEqual([]);
			});
			And("{string} is reported as unmatched", (_ctx, name: string) => {
				expect(hierarchy.unmatched).toContain(name);
			});
		},
	);

	Scenario(
		"Two regions keep their own members",
		({ Given, When, And, Then }) => {
			Given(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			// each resolution snapshots the page as it stands, so the second region sees
			// the section added between the two calls and the first does not
			When(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			And(
				"a region page whose {string} section lists {string}",
				(_ctx, header: string, entry: string) => {
					section(header).lines.push(`* ${entry}`);
				},
			);
			And(
				"the page's links are resolved for {string}",
				(_ctx, region: string) => {
					links = parseResources(page());
					asked.push({ region, links });
					collected = collectResources(asked, byLowerId(), {
						redirectOf,
						kindOf,
					});
				},
			);
			Then(
				"{string} holds {string} with the methods {string}",
				(_ctx, region: string, item: string, methods: string) => {
					expect(
						[...(collected.resolved[region]?.[item] || [])].sort(),
					).toEqual(methods.split(",").sort());
				},
			);
			And(
				"{string} does not hold {string}",
				(_ctx, region: string, item: string) => {
					expect(collected.resolved[region]?.[item]).toBeUndefined();
				},
			);
			And(
				"{string} holds both {string} and {string}",
				(_ctx, region: string, one: string, two: string) => {
					expect(Object.keys(collected.resolved[region] || {}).sort()).toEqual(
						[one, two].sort(),
					);
				},
			);
			And(
				"{string} has {int} members and {string} has {int}",
				(
					_ctx,
					one: string,
					oneCount: number,
					two: string,
					twoCount: number,
				) => {
					expect(Object.keys(collected.resolved[one] || {}).length).toBe(
						oneCount,
					);
					expect(Object.keys(collected.resolved[two] || {}).length).toBe(
						twoCount,
					);
				},
			);
		},
	);
});
