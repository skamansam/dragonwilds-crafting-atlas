/**
 * Cucumber/Gherkin spec for URL routing — the slug rules, the slug ⇄ id index
 * over the real dataset, and hash parsing/round-tripping.
 *
 * Every step drives the shared helpers in tests/lib/routing.ts, which mirror the
 * production logic in src/routing.js (a classic script the page loads before
 * app.js). Keeping one copy of the rules means the feature can't drift from the
 * code that actually resolves `#/ash_logs/iron_sword`.
 *
 * The route model:
 *   #/ash_logs               → 1 segment → select the item
 *   #/ash_logs/iron_sword    → 2 segments → path from the first to the second
 *
 * NOTE: @amiceli/vitest-cucumber calls each step fn as fn(ctx, ...params), so
 * parameterized steps ({string}, {int}) must declare a _ctx placeholder first.
 */

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	buildHash,
	buildIndex,
	D,
	parseHash,
	type SlugIndex,
	slug,
} from "../lib/routing";

const feature = await loadFeature("./routing.feature");

interface RouteState {
	slugIndex: SlugIndex | null;
	slugs: string[];
	segments: string[];
	hash: string;
	resolved: (string | null)[];
}

let state: RouteState;

function reset(): void {
	state = { slugIndex: null, slugs: [], segments: [], hash: "", resolved: [] };
}

const idOf = (name: string): string => {
	const node = D.nodes.find((n: { name: string }) => n.name === name);
	if (!node) throw new Error(`no node named ${name}`);
	return node.id;
};

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given("the routing helpers are loaded", async () => {
			reset();
		});
	});

	/* ── slug rules ──────────────────────────────────────────────────── */

	Scenario("A display name becomes a snake_case slug", ({ When, Then }) => {
		When("I slug the name {string}", async (_ctx, name: string) => {
			state.slugs = [slug(name)];
		});
		Then("the slug is {string}", async (_ctx, want: string) => {
			expect(state.slugs[0]).toBe(want);
		});
	});

	Scenario("Apostrophes are dropped from a slug", ({ When, Then }) => {
		When("I slug the name {string}", async (_ctx, name: string) => {
			state.slugs = [slug(name)];
		});
		Then("the slug is {string}", async (_ctx, want: string) => {
			expect(state.slugs[0]).toBe(want);
		});
	});

	Scenario('Ampersands spell out as "and"', ({ When, Then }) => {
		When("I slug the name {string}", async (_ctx, name: string) => {
			state.slugs = [slug(name)];
		});
		Then("the slug is {string}", async (_ctx, want: string) => {
			expect(state.slugs[0]).toBe(want);
		});
	});

	Scenario(
		"A colon and its spaces collapse to one underscore",
		({ When, Then }) => {
			When("I slug the name {string}", async (_ctx, name: string) => {
				state.slugs = [slug(name)];
			});
			Then("the slug is {string}", async (_ctx, want: string) => {
				expect(state.slugs[0]).toBe(want);
			});
		},
	);

	Scenario("Parentheses are flattened into the slug", ({ When, Then }) => {
		When("I slug the name {string}", async (_ctx, name: string) => {
			state.slugs = [slug(name)];
		});
		Then("the slug is {string}", async (_ctx, want: string) => {
			expect(state.slugs[0]).toBe(want);
		});
	});

	Scenario("Double quotes are dropped from a slug", ({ When, Then }) => {
		When("I slug the name {string}", async (_ctx, name: string) => {
			state.slugs = [slug(name)];
		});
		Then("the slug is {string}", async (_ctx, want: string) => {
			expect(state.slugs[0]).toBe(want);
		});
	});

	/* ── the index over the real dataset ─────────────────────────────── */

	Scenario("Every item round-trips through its own slug", ({ Given, Then }) => {
		Given("the routing index is built from the atlas data", async () => {
			state.slugIndex = buildIndex(D.nodes);
		});
		Then("every node slug resolves back to that node", async () => {
			const idx = state.slugIndex;
			if (!idx) throw new Error("index not built");
			expect(idx.toSlug.size).toBe(D.nodes.length);
			expect(idx.toId.size).toBe(D.nodes.length); // no two nodes share a slug
			for (const n of D.nodes) {
				const s = idx.toSlug.get(n.id);
				expect(s, `no slug for ${n.id}`).toBeTruthy();
				expect(idx.toId.get(s as string)).toBe(n.id);
			}
		});
	});

	Scenario("Colliding names get a numeric suffix", ({ Given, Then }) => {
		Given("the routing index is built from the atlas data", async () => {
			state.slugIndex = buildIndex(D.nodes);
		});
		Then("the colliding names resolve to different ids", async () => {
			const idx = state.slugIndex;
			if (!idx) throw new Error("index not built");
			// the dataset really does carry two names that slug the same way
			expect(slug("Blue Dragon Leather")).toBe(slug("Blue  Dragon Leather"));
			const first = idx.toId.get("blue_dragon_leather");
			const second = idx.toId.get("blue_dragon_leather_2");
			expect(first).toBeTruthy();
			expect(second).toBeTruthy();
			expect(first).not.toBe(second);
			expect(idx.toSlug.get(first as string)).toBe("blue_dragon_leather");
			expect(idx.toSlug.get(second as string)).toBe("blue_dragon_leather_2");
		});
	});

	/* ── hash parsing ────────────────────────────────────────────────── */

	Scenario("A one-item hash selects that item", ({ When, Then, And }) => {
		When("I parse the hash {string}", async (_ctx, hash: string) => {
			state.segments = parseHash(hash).segments;
		});
		Then("the route segment count is {int}", async (_ctx, n: number) => {
			expect(state.segments.length).toBe(n);
		});
		And("the first segment is {string}", async (_ctx, want: string) => {
			expect(state.segments[0]).toBe(want);
		});
	});

	Scenario("A two-item hash routes a path", ({ When, Then, And }) => {
		When("I parse the hash {string}", async (_ctx, hash: string) => {
			state.segments = parseHash(hash).segments;
		});
		Then("the route segment count is {int}", async (_ctx, n: number) => {
			expect(state.segments.length).toBe(n);
		});
		And("the second segment is {string}", async (_ctx, want: string) => {
			expect(state.segments[1]).toBe(want);
		});
	});

	Scenario("An empty hash routes nowhere", ({ When, Then }) => {
		When("I parse the hash {string}", async (_ctx, hash: string) => {
			state.segments = parseHash(hash).segments;
		});
		Then("the route segment count is {int}", async (_ctx, n: number) => {
			expect(state.segments.length).toBe(n);
		});
	});

	Scenario("A bare slash hash routes nowhere", ({ When, Then }) => {
		When("I parse the hash {string}", async (_ctx, hash: string) => {
			state.segments = parseHash(hash).segments;
		});
		Then("the route segment count is {int}", async (_ctx, n: number) => {
			expect(state.segments.length).toBe(n);
		});
	});

	Scenario(
		"Segments are lower-cased and a trailing slash ignored",
		({ When, Then, And }) => {
			When("I parse the hash {string}", async (_ctx, hash: string) => {
				state.segments = parseHash(hash).segments;
			});
			Then("the route segment count is {int}", async (_ctx, n: number) => {
				expect(state.segments.length).toBe(n);
			});
			And("the first segment is {string}", async (_ctx, want: string) => {
				expect(state.segments[0]).toBe(want);
			});
		},
	);

	Scenario("A full URL parses like a bare fragment", ({ When, Then, And }) => {
		When("I parse the hash {string}", async (_ctx, hash: string) => {
			state.segments = parseHash(hash).segments;
		});
		Then("the route segment count is {int}", async (_ctx, n: number) => {
			expect(state.segments.length).toBe(n);
		});
		And("the first segment is {string}", async (_ctx, want: string) => {
			expect(state.segments[0]).toBe(want);
		});
	});

	/* ── round trips ─────────────────────────────────────────────────── */

	Scenario(
		"A selection slug round-trips back to its item",
		({ Given, When, Then }) => {
			Given("the routing index is built from the atlas data", async () => {
				state.slugIndex = buildIndex(D.nodes);
			});
			When("I build a route for {string}", async (_ctx, name: string) => {
				const idx = state.slugIndex;
				if (!idx) throw new Error("index not built");
				state.hash = buildHash([idx.toSlug.get(name)]);
			});
			Then(
				"parsing that route selects {string}",
				async (_ctx, name: string) => {
					const idx = state.slugIndex;
					if (!idx) throw new Error("index not built");
					const ids = parseHash(state.hash).segments.map(
						(s) => idx.toId.get(s) ?? null,
					);
					expect(ids).toEqual([idOf(name)]);
				},
			);
		},
	);

	Scenario(
		"A path slug round-trips back to both items",
		({ Given, When, Then }) => {
			Given("the routing index is built from the atlas data", async () => {
				state.slugIndex = buildIndex(D.nodes);
			});
			When(
				"I build a route for {string} and {string}",
				async (_ctx, a: string, b: string) => {
					const idx = state.slugIndex;
					if (!idx) throw new Error("index not built");
					state.hash = buildHash([idx.toSlug.get(a), idx.toSlug.get(b)]);
				},
			);
			Then(
				"parsing that route selects {string} then {string}",
				async (_ctx, a: string, b: string) => {
					const idx = state.slugIndex;
					if (!idx) throw new Error("index not built");
					const ids = parseHash(state.hash).segments.map(
						(s) => idx.toId.get(s) ?? null,
					);
					expect(ids).toEqual([idOf(a), idOf(b)]);
				},
			);
		},
	);
});
