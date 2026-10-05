/**
 * Cucumber/Gherkin spec for the pure trace math — the frontier walk,
 * progressive expansion, collapse and serialization.
 *
 * This is the Gherkin home for what used to be tests/unit/trace-math.spec.ts.
 * That unit file carried its OWN copies of collectFrontier/traceStep/traceBack/
 * serialize/deserialize, so it could drift from the implementation it claimed
 * to cover. Here every step drives the shared helpers in tests/lib/trace-math.ts
 * (the same pure functions the other feature specs use), so there is one copy.
 *
 * The trace model:
 *   - traceLevels: Map<id, depth> — depth 0 = anchor, 1 = direct neighbours, …
 *   - traceDepth: number — current max revealed depth
 *   - traceStep adds one depth of neighbours (excluding skill-gate spokes;
 *     collecting a recipe's facility for upstream walks)
 *   - traceBack removes the deepest level; at depth ≤ 1 it delegates to
 *     clearTrace (removes everything, anchor included) — matching app.js
 *
 * NOTE: The @amiceli/vitest-cucumber plugin calls each step fn as fn(ctx, ...params),
 * so parameterized steps ({string}, {int}) must declare a _ctx placeholder first.
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	collectFrontier,
	traceStep,
	traceBack,
	serializeTrace,
	deserializeTrace,
	nodeById,
} from "../lib/trace-math";

const feature = await loadFeature("./trace-math.feature");

interface TraceState {
	root: string;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
	exhaustedAt: number | null;
	frontier: string[];
	removed: string[];
	recorded: string[];
	serialized: string | null;
	deserialized: ReturnType<typeof deserializeTrace>;
}

let state: TraceState;

function reset(root = "Iron Sword"): void {
	state = {
		root,
		dir: "up",
		levels: new Map(),
		depth: 0,
		exhaustedAt: null,
		frontier: [],
		removed: [],
		recorded: [],
		serialized: null,
		deserialized: null,
	};
}

/** anchor the trace on `root` at depth 0 */
function anchor(root: string): void {
	reset(root);
	state.levels.set(root, 0);
}

/** walk `n` levels upstream from the anchor */
function runUp(n: number): void {
	const r = traceStep(state.levels, state.root, "up", n);
	state.dir = "up";
	state.depth = r.depth;
	state.exhaustedAt = r.exhaustedAt;
}

/** walk `n` levels downstream from the anchor */
function runDown(n: number): void {
	const r = traceStep(state.levels, state.root, "down", n);
	state.dir = "down";
	state.depth = r.depth;
	state.exhaustedAt = r.exhaustedAt;
}

/** step back one level, delegating to clearTrace at depth ≤ 1 (as app.js does) */
function back(): void {
	const r = traceBack(state.levels, state.depth);
	state.removed = r.removed;
	state.depth = r.newDepth;
}

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given("the Crafting Atlas is loaded", async () => {
			reset();
		});
	});

	/* ── frontier collection ─────────────────────────────────────────── */

	Scenario("Upstream frontier collects a recipe's ingredients", ({ Given, When, Then, And }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		When("I collect the upstream frontier", async () => {
			state.frontier = collectFrontier(state.levels, 0, "up");
		});
		Then("the frontier includes node {string}", async (_ctx, id: string) => {
			expect(state.frontier).toContain(id);
		});
		And("the frontier includes no nodes of kind {string}", async (_ctx, kind: string) => {
			expect(state.frontier.some((id) => nodeById.get(id)?.kind === kind)).toBe(false);
		});
	});

	Scenario("Downstream frontier collects the products", ({ Given, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		When("I collect the downstream frontier", async () => {
			state.frontier = collectFrontier(state.levels, 0, "down");
		});
		Then("the frontier is not empty", async () => {
			expect(state.frontier.length).toBeGreaterThan(0);
		});
	});

	/* ── progressive expansion ───────────────────────────────────────── */

	Scenario("Upstream expansion grows one level per click", ({ Given, When, Then, And }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		When("I trace inputs for {int} levels", async (_ctx, n: number) => runUp(n));
		Then("the trace depth is {int}", async (_ctx, n: number) => {
			expect(state.depth).toBe(n);
		});
		And("the trace contains at least {int} nodes", async (_ctx, n: number) => {
			expect(state.levels.size).toBeGreaterThanOrEqual(n);
		});
	});

	Scenario("Downstream expansion reports exhaustion", ({ Given, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		When("I trace outputs for {int} levels", async (_ctx, n: number) => runDown(n));
		Then("the trace exhausted at level {int}", async (_ctx, n: number) => {
			expect(state.exhaustedAt).toBe(n);
		});
	});

	Scenario("Upstream expansion never walks skill-gate spokes", ({ Given, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		When("I trace inputs for {int} levels", async (_ctx, n: number) => runUp(n));
		Then("the trace has no nodes of kind {string}", async (_ctx, kind: string) => {
			expect([...state.levels.keys()].some((id) => nodeById.get(id)?.kind === kind)).toBe(false);
		});
	});

	/* ── facility awareness ──────────────────────────────────────────── */

	Scenario("Facility-aware upstream expansion", ({ Given, When, Then, And }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		When("I trace inputs for {int} levels", async (_ctx, n: number) => runUp(n));
		Then("the trace includes node {string}", async (_ctx, id: string) => {
			expect(state.levels.has(id)).toBe(true);
		});
		And("the trace additionally includes node {string}", async (_ctx, id: string) => {
			expect(state.levels.has(id)).toBe(true);
		});
		And("the trace further includes node {string}", async (_ctx, id: string) => {
			expect(state.levels.has(id)).toBe(true);
		});
	});

	Scenario("Unresolved facilities are never added as nodes", ({ Given, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		When("I trace inputs for {int} level", async (_ctx, n: number) => runUp(n));
		Then("the trace does not include node {string}", async (_ctx, id: string) => {
			expect(state.levels.has(id)).toBe(false);
		});
	});

	/* ── collapse ────────────────────────────────────────────────────── */

	Scenario("Trace back removes exactly the deepest frontier", ({ Given, And, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		And("I trace inputs for {int} levels", async (_ctx, n: number) => runUp(n));
		And("I record the deepest frontier", async () => {
			const max = Math.max(...state.levels.values());
			state.recorded = [...state.levels.entries()].filter(([, d]) => d === max).map(([id]) => id);
		});
		When("I trace back one level", async () => back());
		Then("the removed nodes are exactly the recorded frontier", async () => {
			expect(new Set(state.removed)).toEqual(new Set(state.recorded));
		});
		And("the trace depth is {int}", async (_ctx, n: number) => {
			expect(state.depth).toBe(n);
		});
	});

	Scenario("Trace back keeps the anchor while levels remain", ({ Given, And, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		And("I trace inputs for {int} levels", async (_ctx, n: number) => runUp(n));
		When("I trace back one level", async () => back());
		Then("the trace includes node {string}", async (_ctx, id: string) => {
			expect(state.levels.has(id)).toBe(true);
		});
		And("the trace depth is {int}", async (_ctx, n: number) => {
			expect(state.depth).toBe(n);
		});
	});

	Scenario("Backing past the last level clears the trace", ({ Given, And, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		And("I trace inputs for {int} level", async (_ctx, n: number) => runUp(n));
		When("I trace back one level", async () => back());
		Then("the trace has {int} nodes", async (_ctx, n: number) => {
			expect(state.levels.size).toBe(n);
		});
	});

	/* ── persistence primitives ──────────────────────────────────────── */

	Scenario("Serialized trace is JSON-safe", ({ Given, And, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		And("I trace inputs for {int} level", async (_ctx, n: number) => runUp(n));
		When("I serialize the trace", async () => {
			state.serialized = serializeTrace(state.root, state.dir, state.levels, state.depth);
		});
		Then("the serialized levels are a JSON array", async () => {
			const obj = JSON.parse(state.serialized as string);
			expect(Array.isArray(obj.levels)).toBe(true);
		});
	});

	Scenario("Deserialization restores every level", ({ Given, And, When, Then }) => {
		Given("a trace anchored on {string}", async (_ctx, root: string) => anchor(root));
		And("I trace inputs for {int} levels", async (_ctx, n: number) => runUp(n));
		When("I serialize the trace", async () => {
			state.serialized = serializeTrace(state.root, state.dir, state.levels, state.depth);
		});
		Then("the deserialized trace restores the original levels", async () => {
			const restored = deserializeTrace(state.serialized);
			expect(restored).not.toBeNull();
			expect(restored!.levels).toEqual(state.levels);
		});
		And("the deserialized trace restores the original depth", async () => {
			const restored = deserializeTrace(state.serialized);
			expect(restored).not.toBeNull();
			expect(restored!.depth).toBe(state.depth);
		});
	});

	Scenario("Deserialization rejects malformed state", ({ When, Then }) => {
		When("I deserialize the trace string {string}", async (_ctx, str: string) => {
			state.deserialized = deserializeTrace(str);
		});
		Then("the deserialized trace is null", async () => {
			expect(state.deserialized).toBeNull();
		});
	});
});
