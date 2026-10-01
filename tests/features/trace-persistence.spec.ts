/**
 * Cucumber/Gherkin spec for trace state persistence (localStorage dw.trace).
 *
 * Tests the serialize/deserialize round-trip from trace-math.ts. The live
 * app.js saveTrace()/restoreTrace() must stay in sync with this serialization.
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as fn(ctx, ...params),
 * so parameterized steps ({string}, {int}) must declare a _ctx placeholder
 * as the first argument.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	traceStep,
	traceBack,
	serializeTrace,
	deserializeTrace,
	nodeExists,
} from "../lib/trace-math";

const feature = await loadFeature("./trace-persistence.feature");

interface TraceState {
	root: string;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
	serialized: string | null;
}

let state: TraceState;
let rememberedCount: number;

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given, And }) => {
		Given("the Crafting Atlas is loaded", async () => {
			state = { root: "Iron Sword", dir: "up", levels: new Map(), depth: 0, serialized: null };
		});
		And("item {string} is open in the panel", async (_ctx, item: string) => {
			state = { root: item, dir: "up", levels: new Map(), depth: 0, serialized: null };
		});
	});

	Scenario("Trace state round-trips through serialization", ({ When, And, Then }) => {
		When("I trace inputs from the panel", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I trace outputs from the panel", async () => {
			traceStep(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		And("I serialize the trace state", async () => {
			state.serialized = serializeTrace(state.root, state.dir, state.levels, state.depth);
		});
		Then("the deserialized trace has the same root", async () => {
			const restored = deserializeTrace(state.serialized);
			expect(restored).not.toBeNull();
			expect(restored!.root).toBe(state.root);
		});
		And("the deserialized trace has the same depth", async () => {
			const restored = deserializeTrace(state.serialized);
			expect(restored).not.toBeNull();
			expect(restored!.depth).toBe(state.depth);
		});
	});

	Scenario("Cleared trace serializes to null", ({ When, And, Then }) => {
		When("I trace inputs from the panel", async () => {
			traceStep(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I reset the trace", async () => {
			state = { root: state.root, dir: "up", levels: new Map(), depth: 0, serialized: null };
		});
		And("I serialize the trace state", async () => {
			state.serialized = serializeTrace(state.root, state.dir, state.levels, state.depth);
		});
		Then("the serialized trace is null", async () => {
			expect(state.serialized).toBeNull();
		});
	});

	Scenario("Stale trace IDs are rejected", ({ Given, And, When, Then }) => {
		Given("a trace state with root {string}", async (_ctx, root: string) => {
			state = { root, dir: "up", levels: new Map(), depth: 0, serialized: null };
		});
		And("the trace has stale node IDs", async () => {
			state.levels.set(state.root, 0);
			state.levels.set("Nonexistent Node", 1);
			state.depth = 1;
		});
		When("I serialize the trace state", async () => {
			const str = serializeTrace(state.root, state.dir, state.levels, state.depth);
			// Simulate app.js restoreTrace validation: stale IDs are rejected
			const restored = deserializeTrace(str);
			const allExist = restored && [...restored.levels.keys()].every((id) => nodeExists(id));
			state.serialized = allExist ? str : null;
		});
		Then("the serialized trace is null", async () => {
			expect(state.serialized).toBeNull();
		});
	});
});
