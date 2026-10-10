/**
 * Cucumber/Gherkin spec for describing exported data edits as a pull request
 * (scripts/open-edits-pr.mjs). Drives scripts/open-edits-pr-core.mjs — the pure
 * half of the script; the git/gh steps are exercised end to end in
 * CONTRIBUTOR-DATA.md's walkthrough.
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as
 * fn(ctx, ...params), so parameterized steps ({string}/{int}) declare a _ctx
 * placeholder as the first argument.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	branchName,
	changeCount,
	changeLines,
	defaultTitle,
	graphChanged,
	prBody,
	summarizeDataset,
	summarizeOverlay,
} from "../../scripts/open-edits-pr-core.mjs";

interface DwNode {
	id: string;
	name: string;
	kind: string;
	itemType?: string | null;
	wiki?: string | null;
	description?: string[];
	stats?: Record<string, unknown>;
}

interface Dataset {
	nodes: DwNode[];
	edges: Array<{ from: string; to: string }>;
}

interface Summary {
	changed: Array<{ id: string; fields: Array<{ field: string; from: unknown; to: unknown }> }>;
	added: Array<{ id: string; kind: string }>;
	removed: string[];
	links: Array<{ from: string; to: string; rel: string }>;
}

const feature = await loadFeature("./edits-pr.feature");

const makeNode = (id: string, kind: string, itemType: string): DwNode => ({
	id,
	name: id,
	kind,
	itemType,
	wiki: `https://dragonwilds.runescape.wiki/w/${id.replace(/ /g, "_")}`,
	description: [],
	stats: {},
});

let dataset: Dataset;
let overlay: Record<string, unknown>;
let summary: Summary;
let branch: string;
let body = "";

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given(
			"a dataset with an {string} node of kind {string} and item type {string}",
			(_ctx, id: string, kind: string, itemType: string) => {
				dataset = { nodes: [makeNode(id, kind, itemType)], edges: [] };
				overlay = { nodes: {} };
				summary = { changed: [], added: [], removed: [], links: [] };
				branch = "";
				body = "";
			},
		);
	});

	Scenario(
		"A changed field is named in the commit and the PR body",
		({ Given, When, Then, And }) => {
			Given(
				"an edits overlay changing {string} itemType to {string}",
				(_ctx, id: string, itemType: string) => {
					overlay = { format: "dragonwilds-edits", version: 1, nodes: { [id]: { itemType } } };
				},
			);
			When("the overlay is summarised", () => {
				summary = summarizeOverlay(dataset, overlay) as Summary;
				body = prBody({ summary, base: "main" });
			});
			Then("the change is reported as {string}", (_ctx, line: string) => {
				expect(changeLines(summary as never)).toContain(line);
			});
			And("the default title names {string}", (_ctx, name: string) => {
				expect(defaultTitle(summary as never)).toContain(name);
			});
			And("the PR body lists the change under {string}", (_ctx, heading: string) => {
				expect(body).toContain(`## ${heading}`);
				expect(body.split(`## ${heading}`)[1]).toContain("itemType");
			});
		},
	);

	Scenario("The branch name follows an explicit title", ({ Given, When, Then, And }) => {
		Given(
			"an edits overlay changing {string} itemType to {string}",
			(_ctx, id: string, itemType: string) => {
				overlay = { nodes: { [id]: { itemType } } };
			},
		);
		When("the overlay is summarised", () => {
			summary = summarizeOverlay(dataset, overlay) as Summary;
		});
		And("the branch is named from the title {string}", (_ctx, title: string) => {
			branch = branchName(summary as never, title);
		});
		Then("the branch is {string}", (_ctx, name: string) => {
			expect(branch).toBe(name);
		});
	});

	Scenario("A link makes it a graph change", ({ Given, When, Then, And }) => {
		Given(
			"an edits overlay adding a {string} link from {string} to {string}",
			(_ctx, rel: string, from: string, to: string) => {
				dataset.nodes.push(makeNode(to, "material", "Processed Material"));
				overlay = { nodes: {}, links: [{ from, to, rel }] };
			},
		);
		When("the overlay is summarised", () => {
			summary = summarizeOverlay(dataset, overlay) as Summary;
		});
		Then("the graph is reported as changed", () => {
			expect(graphChanged(summary as never)).toBe(true);
			expect(changeCount(summary as never)).toBe(1);
		});
		And("the default title names {string}", (_ctx, name: string) => {
			expect(defaultTitle(summary as never)).toContain(name);
		});
	});

	Scenario("Field-only edits leave the exports alone", ({ Given, When, Then }) => {
		Given(
			"an edits overlay changing {string} itemType to {string}",
			(_ctx, id: string, itemType: string) => {
				overlay = { nodes: { [id]: { itemType } } };
			},
		);
		When("the overlay is summarised", () => {
			summary = summarizeOverlay(dataset, overlay) as Summary;
		});
		Then("the graph is not reported as changed", () => {
			expect(graphChanged(summary as never)).toBe(false);
		});
	});

	Scenario(
		"An edit the dataset has already caught up with is not described",
		({ Given, When, Then }) => {
			Given(
				"an edits overlay changing {string} itemType to {string}",
				(_ctx, id: string, itemType: string) => {
					overlay = { nodes: { [id]: { itemType } } };
				},
			);
			When("the overlay is summarised", () => {
				summary = summarizeOverlay(dataset, overlay) as Summary;
			});
			Then("the summary is empty", () => {
				expect(changeCount(summary as never)).toBe(0);
				expect(changeLines(summary as never)).toEqual([]);
			});
		},
	);

	Scenario(
		"A full dataset export is diffed against the dataset it replaces",
		({ Given, When, Then, And }) => {
			Given("a full dataset export of one node {string} and one node {string}", (_ctx, a: string, b: string) => {
				overlay = {
					nodes: [makeNode(a, "other", "Bar"), makeNode(b, "resource", "Resource Node")],
				};
			});
			And("the dataset also has a node {string}", (_ctx, id: string) => {
				dataset.nodes.push(makeNode(id, "other", "Bar"));
			});
			When("the export is summarised against the dataset", () => {
				summary = summarizeDataset(dataset, overlay) as unknown as Summary;
			});
			Then("the summary reports {string} as added", (_ctx, id: string) => {
				expect(summary.added.map((a) => a.id)).toContain(id);
			});
			And("the summary reports {string} as removed", (_ctx, id: string) => {
				expect(summary.removed).toContain(id);
			});
		},
	);
});
