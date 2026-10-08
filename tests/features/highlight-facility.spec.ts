/**
 * Cucumber/Gherkin spec for facility-aware highlight requires (TODO #23).
 *
 * Tests the highlight frontier math from tests/lib/highlight-math.ts: when
 * expanding upstream (requires), an edge's `facility` field that resolves to a
 * station/tool node is collected as a frontier node at the same depth as the
 * ingredients. Downstream (enables) walks exclude facilities.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { expandHighlight, nodeById } from "../lib/highlight-math";

const feature = await loadFeature("./highlight-facility.feature");

interface HighlightState {
	root: string;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
}

let state: HighlightState;

function makeState(root: string): HighlightState {
	return { root, dir: "up", levels: new Map(), depth: 0 };
}

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given("the Crafting Atlas is loaded", async () => {
			state = makeState("");
		});
	});

	Scenario("Requires from Draconic Staff surfaces the Mystic Forge facility", ({ Given, When, Then, And }) => {
		Given("item {string} is the highlight root", async (_ctx, item: string) => {
			state = makeState(item);
		});
		When("I expand requires 1 level", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.dir = "up";
			state.depth = 1;
		});
		Then("the highlight includes node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(true);
		});
		And("the node {string} has kind {string}", async (_ctx, nodeId: string, kind: string) => {
			expect(nodeById.get(nodeId)?.kind).toBe(kind);
		});
	});

	Scenario("Expanding Mystic Forge reveals its Build Menu inputs", ({ Given, When, Then, And }) => {
		Given("item {string} is the highlight root", async (_ctx, item: string) => {
			state = makeState(item);
		});
		When("I expand requires 1 level", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.dir = "up";
			state.depth = 1;
		});
		Then("the highlight includes node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(true);
		});
		And("the highlight includes node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(true);
		});
	});

	Scenario("Enables does not surface facilities", ({ Given, When, Then }) => {
		Given("item {string} is the highlight root", async (_ctx, item: string) => {
			state = makeState(item);
		});
		When("I expand enables 1 level", async () => {
			expandHighlight(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		Then("the highlight does not include node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(false);
		});
	});
});
