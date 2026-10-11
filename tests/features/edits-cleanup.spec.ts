/**
 * Cucumber/Gherkin spec for the post-update cleanup of local data edits (P6-7).
 * Drives classifyEdits() in src/edits.js — the pure half of the feature; the
 * dialog itself is covered by the `edits` checks in scripts/test-ui.mjs.
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as
 * fn(ctx, ...params), so parameterized steps ({string}/{int}) declare a _ctx
 * placeholder as the first argument.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { classifyEdits } from "../../src/edits.js";

interface Classified {
	merged: string[];
	moved: string[];
}

const feature = await loadFeature("./edits-cleanup.feature");

let bundled: Map<string, Record<string, unknown>>;
let edits: Record<string, Record<string, unknown>>;
let base: Record<string, Record<string, unknown>>;
let result: Classified;

// one bundled node, shaped like the real dataset rows
const bundledNode = (itemType: string) => ({
	name: "Iron Bar",
	kind: "material",
	itemType,
	wiki: "https://dragonwilds.runescape.wiki/w/Iron_Bar",
	description: [],
	stats: {},
});

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given(
			"the dataset ships {string} with itemType {string}",
			(_ctx, id: string, itemType: string) => {
				bundled = new Map([[id, bundledNode(itemType)]]);
				edits = {};
				base = {};
				result = { merged: [], moved: [] };
			},
		);
	});

	Scenario("An edit the dataset now ships is a duplicate", ({ Given, When, Then, And }) => {
		Given(
			"an edit setting {string} itemType to {string}",
			(_ctx, id: string, itemType: string) => {
				edits[id] = { itemType };
			},
		);
		When("the edits are classified", () => {
			result = classifyEdits(edits, base, bundled) as Classified;
		});
		Then("{string} is listed as a duplicate", (_ctx, id: string) => {
			expect(result.merged).toContain(id);
		});
		And("{string} is not listed as overriding an update", (_ctx, id: string) => {
			expect(result.moved).not.toContain(id);
		});
	});

	Scenario(
		"An edit overriding a row the dataset has changed",
		({ Given, When, Then, And }) => {
			Given(
				"an edit setting {string} itemType to {string}",
				(_ctx, id: string, itemType: string) => {
					edits[id] = { itemType };
				},
			);
			And(
				"that edit was saved when the dataset said {string}",
				(_ctx, itemType: string) => {
					base["Iron Bar"] = { itemType };
				},
			);
			When("the edits are classified", () => {
				result = classifyEdits(edits, base, bundled) as Classified;
			});
			Then("{string} is listed as overriding an update", (_ctx, id: string) => {
				expect(result.moved).toContain(id);
			});
			And("{string} is not listed as a duplicate", (_ctx, id: string) => {
				expect(result.merged).not.toContain(id);
			});
		},
	);

	Scenario("An edit the dataset has left alone is neither", ({ Given, When, Then, And }) => {
		Given(
			"an edit setting {string} itemType to {string}",
			(_ctx, id: string, itemType: string) => {
				edits[id] = { itemType };
			},
		);
		And("that edit was saved when the dataset said {string}", (_ctx, itemType: string) => {
			base["Iron Bar"] = { itemType };
		});
		When("the edits are classified", () => {
			result = classifyEdits(edits, base, bundled) as Classified;
		});
		Then("neither list mentions {string}", (_ctx, id: string) => {
			expect(result.merged).not.toContain(id);
			expect(result.moved).not.toContain(id);
		});
	});

	Scenario("An edit with no recorded baseline is never called stale", ({ Given, When, Then }) => {
		Given(
			"an edit setting {string} itemType to {string}",
			(_ctx, id: string, itemType: string) => {
				edits[id] = { itemType };
			},
		);
		When("the edits are classified", () => {
			result = classifyEdits(edits, base, bundled) as Classified;
		});
		Then("neither list mentions {string}", (_ctx, id: string) => {
			expect(result.merged).not.toContain(id);
			expect(result.moved).not.toContain(id);
		});
	});

	Scenario("An edit to a node the dataset no longer ships is ignored", ({ Given, When, Then }) => {
		Given(
			"an edit setting {string} itemType to {string}",
			(_ctx, id: string, itemType: string) => {
				edits[id] = { itemType };
			},
		);
		When("the edits are classified", () => {
			result = classifyEdits(edits, base, bundled) as Classified;
		});
		Then("neither list mentions {string}", (_ctx, id: string) => {
			expect(result.merged).not.toContain(id);
			expect(result.moved).not.toContain(id);
		});
	});
});
