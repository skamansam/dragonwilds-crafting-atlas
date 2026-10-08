/**
 * Cucumber/Gherkin spec for highlight state persistence (localStorage dw.highlight).
 *
 * Tests the serialize/deserialize round-trip from highlight-math.ts. The live
 * app.js saveHighlight()/restoreHighlight() must stay in sync with this serialization.
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as fn(ctx, ...params),
 * so parameterized steps ({string}, {int}) must declare a _ctx placeholder
 * as the first argument.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	expandHighlight,
	serializeHighlight,
	deserializeHighlight,
	nodeExists,
} from "../lib/highlight-math";

const feature = await loadFeature("./highlight-persistence.feature");

interface HighlightState {
	root: string;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
	serialized: string | null;
}

let state: HighlightState;
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

	Scenario("Highlight state round-trips through serialization", ({ When, And, Then }) => {
		When("I show requires from the panel", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I show enables from the panel", async () => {
			expandHighlight(state.levels, state.root, "down", 1);
			state.dir = "down";
			state.depth = 1;
		});
		And("I serialize the highlight state", async () => {
			state.serialized = serializeHighlight(state.root, state.dir, state.levels, state.depth);
		});
		Then("the deserialized highlight has the same root", async () => {
			const restored = deserializeHighlight(state.serialized);
			expect(restored).not.toBeNull();
			expect(restored!.root).toBe(state.root);
		});
		And("the deserialized highlight has the same depth", async () => {
			const restored = deserializeHighlight(state.serialized);
			expect(restored).not.toBeNull();
			expect(restored!.depth).toBe(state.depth);
		});
	});

	Scenario("Cleared highlight serializes to null", ({ When, And, Then }) => {
		When("I show requires from the panel", async () => {
			expandHighlight(state.levels, state.root, "up", 1);
			state.depth = 1;
		});
		And("I reset the highlight", async () => {
			state = { root: state.root, dir: "up", levels: new Map(), depth: 0, serialized: null };
		});
		And("I serialize the highlight state", async () => {
			state.serialized = serializeHighlight(state.root, state.dir, state.levels, state.depth);
		});
		Then("the serialized highlight is null", async () => {
			expect(state.serialized).toBeNull();
		});
	});

	Scenario("Stale highlight IDs are rejected", ({ Given, And, When, Then }) => {
		Given("a highlight state with root {string}", async (_ctx, root: string) => {
			state = { root, dir: "up", levels: new Map(), depth: 0, serialized: null };
		});
		And("the highlight has stale node IDs", async () => {
			state.levels.set(state.root, 0);
			state.levels.set("Nonexistent Node", 1);
			state.depth = 1;
		});
		When("I serialize the highlight state", async () => {
			const str = serializeHighlight(state.root, state.dir, state.levels, state.depth);
			// Simulate app.js restoreHighlight validation: stale IDs are rejected
			const restored = deserializeHighlight(str);
			const allExist = restored && [...restored.levels.keys()].every((id) => nodeExists(id));
			state.serialized = allExist ? str : null;
		});
		Then("the serialized highlight is null", async () => {
			expect(state.serialized).toBeNull();
		});
	});
});
