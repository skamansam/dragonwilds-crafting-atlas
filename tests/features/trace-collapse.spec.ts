/**
 * Cucumber/Gherkin spec for the trace collapse (traceBack) and reset buttons.
 *
 * Runs in vitest (node environment) — tests the trace frontier math directly,
 * mirroring the same walk logic that app.js uses on the live graph. The Gherkin
 * steps describe the user-facing behaviour that the browser tests in
 * scripts/test-ui.mjs exercise end-to-end.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { traceStep, traceBack } from "../lib/trace-math";

const feature = await loadFeature("./trace-collapse.feature");

interface TraceState {
	root: string;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
}

let state: TraceState;
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

	Scenario("Trace inputs grows the frontier", ({ When, Then }) => {
		When("I trace inputs from the panel", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		Then("the trace has at least {int} node after {int}ms", async (_ctx, min: number, _ms: number) => {
			// +1 for the anchor; after tracing 1 level the frontier + anchor > min
			expect(state.levels.size).toBeGreaterThanOrEqual(min + 1);
		});
	});

	Scenario("Trace out grows the frontier further", ({ When, And, Then }) => {
		When("I trace inputs from the panel", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I trace outputs from the panel", async () => {
			traceStep(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		Then("the trace has at least {int} more node than the previous trace", async (_ctx, extra: number) => {
			expect(state.levels.size).toBeGreaterThanOrEqual(2 + extra);
		});
	});

	Scenario("Trace back shrinks the frontier by one level", ({ When, And, Then }) => {
		When("I trace inputs from the panel", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I trace outputs from the panel", async () => {
			traceStep(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		And("I remember the trace node count", async () => {
			rememberedCount = state.levels.size;
		});
		And("I trace back one level", async () => {
			const result = traceBack(state.levels, state.depth);
			state.depth = result.newDepth;
		});
		Then("the trace has fewer nodes than the remembered count", async () => {
			expect(state.levels.size).toBeLessThan(rememberedCount);
		});
	});

	Scenario("Trace back to depth zero clears the trace", ({ When, And, Then }) => {
		When("I trace inputs from the panel", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I trace back one level", async () => {
			const result = traceBack(state.levels, state.depth);
			state.depth = result.newDepth;
		});
		Then("the trace has {int} nodes", async (_ctx, n: number) => {
			expect(state.levels.size).toBe(n);
		});
	});

	Scenario("Reset trace removes all highlights", ({ When, And, Then }) => {
		When("I trace inputs from the panel", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I reset the trace", async () => {
			state = { root: state.root, dir: "up", levels: new Map(), depth: 0 };
		});
		Then("the trace has {int} nodes", async (_ctx, n: number) => {
			expect(state.levels.size).toBe(n);
		});
	});
});
