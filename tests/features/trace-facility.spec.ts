/**
 * Cucumber/Gherkin spec for facility-aware trace inputs (TODO #23).
 *
 * Tests the trace frontier math from tests/lib/trace-math.ts: when tracing
 * upstream (inputs), an edge's `facility` field that resolves to a station/toolkit
 * node is collected as a frontier node at the same depth as the ingredients.
 * Downstream (makes) traces exclude facilities.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { traceStep, nodeById } from "../lib/trace-math";

const feature = await loadFeature("./trace-facility.feature");

interface TraceState {
	root: string;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
}

let state: TraceState;

function makeState(root: string): TraceState {
	return { root, dir: "up", levels: new Map(), depth: 0 };
}

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given("the Crafting Atlas is loaded", async () => {
			state = makeState("");
		});
	});

	Scenario("Trace inputs from Draconic Staff surfaces the Mystic Forge facility", ({ Given, When, Then, And }) => {
		Given("item {string} is the trace root", async (_ctx, item: string) => {
			state = makeState(item);
		});
		When("I trace inputs 1 level", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.dir = "up";
			state.depth = 1;
		});
		Then("the trace includes node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(true);
		});
		And("the node {string} has kind {string}", async (_ctx, nodeId: string, kind: string) => {
			expect(nodeById.get(nodeId)?.kind).toBe(kind);
		});
	});

	Scenario("Tracing Mystic Forge reveals its Build Menu inputs", ({ Given, When, Then, And }) => {
		Given("item {string} is the trace root", async (_ctx, item: string) => {
			state = makeState(item);
		});
		When("I trace inputs 1 level", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.dir = "up";
			state.depth = 1;
		});
		Then("the trace includes node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(true);
		});
		And("the trace includes node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(true);
		});
	});

	Scenario("Trace makes does not surface facilities", ({ Given, When, Then }) => {
		Given("item {string} is the trace root", async (_ctx, item: string) => {
			state = makeState(item);
		});
		When("I trace outputs 1 level", async () => {
			traceStep(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		Then("the trace does not include node {string}", async (_ctx, nodeId: string) => {
			expect(state.levels.has(nodeId)).toBe(false);
		});
	});
});
