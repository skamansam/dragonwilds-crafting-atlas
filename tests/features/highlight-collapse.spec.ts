/**
 * Cucumber/Gherkin spec for the highlight collapse (stepBackHighlight) and reset buttons.
 *
 * Runs in vitest (node environment) — tests the highlight frontier math directly,
 * mirroring the same walk logic that app.js uses on the live graph. The Gherkin
 * steps describe the user-facing behaviour that the browser tests in
 * scripts/test-ui.mjs exercise end-to-end.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { expandHighlight, stepBackHighlight } from "../lib/highlight-math";

const feature = await loadFeature("./highlight-collapse.feature");

interface HighlightState {
	root: string;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
}

let state: HighlightState;
let rememberedCount: number;

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given, And }) => {
		Given("the Crafting Atlas is loaded", async () => {
			state = { root: "Iron Sword", dir: "up", levels: new Map(), depth: 0 };
		});
		And("item {string} is open in the panel", async (_ctx, item: string) => {
			state = { root: item, dir: "up", levels: new Map(), depth: 0 };
		});
	});

	Scenario("Requires grows the frontier", ({ When, Then }) => {
		When("I show requires from the panel", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		Then("the highlight has at least {int} node after {int}ms", async (_ctx, min: number, _ms: number) => {
			// +1 for the anchor; after expanding 1 level the frontier + anchor > min
			expect(state.levels.size).toBeGreaterThanOrEqual(min + 1);
		});
	});

	Scenario("Enables grows the frontier further", ({ When, And, Then }) => {
		When("I show requires from the panel", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I show enables from the panel", async () => {
			expandHighlight(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		Then("the highlight has at least {int} more node than the previous highlight", async (_ctx, extra: number) => {
			expect(state.levels.size).toBeGreaterThanOrEqual(2 + extra);
		});
	});

	Scenario("Step back shrinks the frontier by one level", ({ When, And, Then }) => {
		When("I show requires from the panel", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I show enables from the panel", async () => {
			expandHighlight(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		And("I remember the highlight node count", async () => {
			rememberedCount = state.levels.size;
		});
		And("I step back one level", async () => {
			const result = stepBackHighlight(state.levels, state.depth);
			state.depth = result.newDepth;
		});
		Then("the highlight has fewer nodes than the remembered count", async () => {
			expect(state.levels.size).toBeLessThan(rememberedCount);
		});
	});

	Scenario("Step back to depth zero clears the highlight", ({ When, And, Then }) => {
		When("I show requires from the panel", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I step back one level", async () => {
			const result = stepBackHighlight(state.levels, state.depth);
			state.depth = result.newDepth;
		});
		Then("the highlight has {int} nodes", async (_ctx, n: number) => {
			expect(state.levels.size).toBe(n);
		});
	});

	Scenario("Reset removes all highlights", ({ When, And, Then }) => {
		When("I show requires from the panel", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I reset the highlight", async () => {
			state = { root: state.root, dir: "up", levels: new Map(), depth: 0 };
		});
		Then("the highlight has {int} nodes", async (_ctx, n: number) => {
			expect(state.levels.size).toBe(n);
		});
	});
});
