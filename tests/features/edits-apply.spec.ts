/**
 * Cucumber/Gherkin spec for baking browser-exported data edits into the
 * dataset (PLAN §3 P6-5/P6-6). Drives scripts/apply-edits-core.mjs, which the
 * scripts/apply-edits.mjs CLI and the app's Export buttons agree on.
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as
 * fn(ctx, ...params), so parameterized steps ({string}/{int}) declare a _ctx
 * placeholder as the first argument.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	applyDatasetExport,
	mergeEditsOverlay,
	validateDatasetExport,
} from "../../scripts/apply-edits-core.mjs";

interface DwNode {
	id: string;
	name: string;
	kind: string;
	itemType?: string | null;
	wiki?: string | null;
	description?: string[];
	stats?: Record<string, unknown>;
}

interface DwEdge {
	from: string;
	to: string;
	rel?: string | null;
}

interface Dataset {
	nodes: DwNode[];
	edges: DwEdge[];
}

interface EditsOverlay {
	format?: string;
	version?: number;
	nodes: Record<string, Partial<DwNode>>;
	links?: Array<{ from: string; to: string; rel: string }>;
}

const feature = await loadFeature("./edits-apply.feature");

let dataset: Dataset;
let overlay: EditsOverlay;
let datasetExport: { nodes: DwNode[]; edges: DwEdge[] };
let result: {
	changed: number;
	missed: string[];
	linksAdded: number;
	missedLinks: string[];
};
let validation: { ok: boolean; error?: string };

const makeNode = (id: string, kind: string): DwNode => ({
	id,
	name: id,
	kind,
	itemType: null,
	wiki: null,
	description: [],
	stats: {},
});

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given(
			"a dataset with an {string} node and an {string} node",
			(_ctx, a: string, b: string) => {
				dataset = { nodes: [makeNode(a, "other"), makeNode(b, "resource")], edges: [] };
				overlay = { nodes: {} };
				datasetExport = { nodes: [], edges: [] };
				result = { changed: 0, missed: [], linksAdded: 0, missedLinks: [] };
				validation = { ok: true };
			},
		);
	});

	Scenario("An edited field is merged onto the dataset", ({ Given, When, Then, And }) => {
		Given(
			"an edits overlay changing {string} kind to {string}",
			(_ctx, id: string, kind: string) => {
				overlay = { format: "dragonwilds-edits", version: 1, nodes: { [id]: { kind } } };
			},
		);
		When("the edits overlay is merged", () => {
			result = mergeEditsOverlay(dataset, overlay);
		});
		Then("node {string} has kind {string}", (_ctx, id: string, kind: string) => {
			expect(dataset.nodes.find((n) => n.id === id)?.kind).toBe(kind);
		});
		And("the merge reports {int} changed nodes", (_ctx, n: number) => {
			expect(result.changed).toBe(n);
		});
	});

	Scenario("Unchanged values change nothing", ({ Given, When, Then }) => {
		Given("an edits overlay repeating the current values", () => {
			overlay = { nodes: { "Iron Bar": { kind: "other" } } };
		});
		When("the edits overlay is merged", () => {
			result = mergeEditsOverlay(dataset, overlay);
		});
		Then("the merge reports {int} changed nodes", (_ctx, n: number) => {
			expect(result.changed).toBe(n);
		});
	});

	Scenario("Unknown ids are skipped and reported", ({ Given, When, Then }) => {
		Given(
			"an edits overlay changing {string} name to {string}",
			(_ctx, id: string, name: string) => {
				overlay = { nodes: { [id]: { name } } };
			},
		);
		When("the edits overlay is merged", () => {
			result = mergeEditsOverlay(dataset, overlay);
		});
		Then("the merge reports {string} as missed", (_ctx, id: string) => {
			expect(result.missed).toContain(id);
			expect(result.changed).toBe(0);
		});
	});

	Scenario("A full dataset export replaces the graph", ({ Given, When, Then, And }) => {
		Given("a full dataset export with one node {string}", (_ctx, id: string) => {
			datasetExport = { nodes: [makeNode(id, "material")], edges: [] };
		});
		When("the dataset export is validated and applied", () => {
			validation = validateDatasetExport(datasetExport);
			expect(validation.ok).toBe(true);
			applyDatasetExport(dataset, datasetExport);
		});
		Then("the dataset has a node {string}", (_ctx, id: string) => {
			expect(dataset.nodes.some((n) => n.id === id)).toBe(true);
		});
		And("the dataset no longer has a node {string}", (_ctx, id: string) => {
			expect(dataset.nodes.some((n) => n.id === id)).toBe(false);
		});
	});

	Scenario("A custom relationship becomes an edge", ({ Given, When, Then }) => {
		Given(
			"an edits overlay adding a {string} link from {string} to {string}",
			(_ctx, rel: string, from: string, to: string) => {
				overlay = { nodes: {}, links: [{ from, to, rel }] };
			},
		);
		When("the edits overlay is merged", () => {
			result = mergeEditsOverlay(dataset, overlay);
		});
		Then(
			"the dataset has a {string} edge from {string} to {string}",
			(_ctx, rel: string, from: string, to: string) => {
				expect(
					dataset.edges.some((e) => e.from === from && e.to === to && e.rel === rel),
				).toBe(true);
			},
		);
	});

	Scenario("A link to an unknown node is skipped", ({ Given, When, Then }) => {
		Given(
			"an edits overlay adding a {string} link from {string} to {string}",
			(_ctx, rel: string, from: string, to: string) => {
				overlay = { nodes: {}, links: [{ from, to, rel }] };
			},
		);
		When("the edits overlay is merged", () => {
			result = mergeEditsOverlay(dataset, overlay);
		});
		Then("the merge reports the link {string} as skipped", (_ctx, label: string) => {
			expect(result.missedLinks).toContain(label);
			expect(result.linksAdded).toBe(0);
		});
	});

	Scenario("A dataset export with duplicate ids is rejected", ({ Given, When, Then }) => {
		Given("a dataset export with a duplicate {string} id", (_ctx, id: string) => {
			datasetExport = { nodes: [makeNode(id, "material"), makeNode(id, "material")], edges: [] };
		});
		When("the dataset export is validated", () => {
			validation = validateDatasetExport(datasetExport);
		});
		Then("the validation fails", () => {
			expect(validation.ok).toBe(false);
		});
	});
});
