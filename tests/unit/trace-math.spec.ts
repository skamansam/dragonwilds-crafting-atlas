/**
 * Unit tests for the progressive trace engine's pure logic.
 *
 * These mirror the frontier-collection math in site/app.js traceStep() and
 * the new traceBack() function. The app.js logic lives inside classic-script
 * closures (cytoscape-dependent), so we replicate the pure data transform
 * here to keep the walk math testable without a browser — exactly as
 * cache/bread-probe.mjs has done since the trace shipped.
 *
 * The trace model:
 *   - traceLevels: Map<id, depth> — depth 0 = anchor, 1 = direct neighbours, …
 *   - traceDepth: number — current max revealed depth
 *   - traceStep adds one depth of neighbours (excluding skill-gate spokes)
 *   - traceBack removes the deepest level, restoring previous visibility state
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load the production dataset for realistic edge cases
const dataPath = resolve(process.cwd(), "site", "data.json");
const D = JSON.parse(readFileSync(dataPath, "utf8"));
const nodeById = new Map(D.nodes.map((n) => [n.id, n]));
const SKILL_NAMES = new Set(D.skills.map((s) => s.name));

/**
 * Replicates traceStep's frontier collection: given the current traceLevels
 * map and traceDepth, collect the next depth of neighbours in `dir`,
 * skipping skill-gate spokes.
 *   'up'   = inputs  (e.to === nid → e.from is the ingredient)
 *   'down' = outputs (e.from === nid → e.to is the product)
 */
function collectFrontier(
	traceLevels: Map<string, number>,
	traceDepth: number,
	dir: "up" | "down"
) {
	const next: string[] = [];
	for (const [nid, d] of traceLevels) {
		if (d !== traceDepth) continue;
		for (const e of D.edges) {
			const nb =
				dir === "down"
					? e.from === nid
						? e.to
						: null
					: e.to === nid
						? e.from
						: null;
			if (nb === null || traceLevels.has(nb)) continue;
			// skill-gate edges (skill → unlocks) must not join the walk
			const src = dir === "down" ? nid : nb;
			if (nodeById.get(src)?.kind === "skill") continue;
			traceLevels.set(nb, d + 1);
			next.push(nb);
		}
	}
	return next;
}

/**
 * Simulates traceStep: add one level, return the new frontier.
 */
function traceStep(
	traceLevels: Map<string, number>,
	root: string,
	dir: "up" | "down",
	clicks: number
): { levels: number; depth: number; nodes: string[]; exhaustedAt: number | null } {
	let d = 0;
	let exhaustedAt: number | null = null;
	traceLevels.set(root, 0);
	for (let c = 1; c <= clicks; c++) {
		const next = collectFrontier(traceLevels, d, dir);
		if (!next.length) {
			exhaustedAt = c - 1;
			break;
		}
		d++;
	}
	return {
		levels: traceLevels.size,
		depth: d,
		nodes: [...traceLevels.keys()],
		exhaustedAt,
	};
}

/**
 * Replicates traceBack: drop the deepest level from traceLevels, decrement depth.
 * Returns the set of removed node IDs.
 */
function traceBack(traceLevels: Map<string, number>, traceDepth: number): {
	removed: string[];
	newDepth: number;
} {
	const removed: string[] = [];
	for (const [nid, d] of traceLevels) {
		if (d === traceDepth) {
			traceLevels.delete(nid);
			removed.push(nid);
		}
	}
	return { removed, newDepth: traceDepth - 1 };
}

/**
 * Serializes trace state for localStorage persistence (dw.trace key).
 * Map → array of [id, depth] pairs (JSON-safe, avoids Map-in-JSON issues
 * which parse-wiki.mjs resolveXP notes as a general gotcha).
 */
function serializeTrace(root: string | null, dir: string | null, levels: Map<string, number>, depth: number) {
	return JSON.stringify({
		root: root || null,
		dir: dir || null,
		levels: Array.from(levels.entries()),
		depth,
	});
}

/**
 * Deserializes trace state from localStorage.
 */
function deserializeTrace(str: string): {
	root: string | null;
	dir: "up" | "down" | null;
	levels: Map<string, number>;
	depth: number;
} | null {
	try {
		const obj = JSON.parse(str);
		if (!obj.root || !obj.dir) return null;
		return {
			root: obj.root,
			dir: obj.dir as "up" | "down",
			levels: new Map(obj.levels as [string, number][]),
			depth: obj.depth as number,
		};
	} catch {
		return null;
	}
}

describe("trace frontier collection", () => {
	it("collects direct inputs of Bread (flour)", () => {
		const levels = new Map<string, number>([["Bread", 0]]);
		const frontier = collectFrontier(levels, 0, "up");
		expect(frontier.length).toBeGreaterThan(0);
		// Bread's primary recipe inputs should include something flour-like
		const names = frontier.map((id) => nodeById.get(id)?.name || id);
		expect(names.some((n) => /flour/i.test(n))).toBe(true);
	});

	it("excludes skill-gate edges from upstream traces", () => {
		// Iron Bar is crafted with Iron Ore + Coal. An upstream trace must
		// pull ingredients, not Artisan's ~200 skill unlocks.
		const levels = new Map<string, number>([["Iron Bar", 0]]);
		const frontier = collectFrontier(levels, 0, "up");
		// Should include Iron Ore as an ingredient
		const names = frontier.map((id) => nodeById.get(id)?.name || id);
		expect(names.some((n) => /iron ore/i.test(n))).toBe(true);
		// Must NOT include skill nodes (Artisan unlocks)
		expect(frontier.some((id) => nodeById.get(id)?.kind === "skill")).toBe(false);
	});

	it("collects downstream makes for Bread", () => {
		const levels = new Map<string, number>([["Bread", 0]]);
		const frontier = collectFrontier(levels, 0, "down");
		// Bread feeds into sandwiches and other prepared foods
		expect(frontier.length).toBeGreaterThan(0);
	});
});

describe("progressive trace expansion (P22)", () => {
	it("Bread inputs grows one level per click (wheat → flour → ...)", () => {
		const { levels, depth } = traceStep(new Map(), "Bread", "up", 2);
		// 2 clicks = anchor + 2 frontier levels
		expect(depth).toBe(2);
		expect(levels).toBeGreaterThanOrEqual(3); // at least 3 nodes
	});

	it("Bread makes exhausts after one level (leaf product)", () => {
		const r1 = traceStep(new Map(), "Bread", "down", 1);
		// Bread makes something — not a leaf
		expect(r1.depth).toBe(1);
		const r2 = traceStep(new Map(), "Bread", "down", 2);
		// Bread's downstream chain exhausts after one frontier: depth 1 was the
		// last level with content, so click 2 (which would extend to depth 2)
		// found nothing → exhaustedAt = 2 - 1 = 1
		expect(r2.exhaustedAt).toBe(1);
	});

	it("Iron Bar inputs depth 2 includes raw materials, not skills", () => {
		const { nodes } = traceStep(new Map(), "Iron Bar", "up", 2);
		const kinds = new Set(nodes.map((id) => nodeById.get(id)?.kind));
		expect(kinds.has("skill")).toBe(false);
	});
});

describe("traceBack (progressive collapse)", () => {
	it("drops the deepest level and decrements depth", () => {
		// Iron Sword upstream has 3 levels: Bar/Leather/Wool/Vault → Ore/Flax/...
		// → Animal Hide/Scraps/Swamp Tar. Bread upstream only reaches 2.
		const levels = new Map<string, number>([["Iron Sword", 0]]);
		traceStep(levels, "Iron Sword", "up", 3); // grow 3 levels
		const depthBefore = Math.max(...levels.values());
		expect(depthBefore).toBe(3);

		const { removed, newDepth } = traceBack(levels, depthBefore);
		expect(newDepth).toBe(2);
		// The deepest nodes should be removed
		expect(removed.length).toBeGreaterThan(0);
		// New max depth should be 2
		expect(Math.max(...levels.values())).toBe(2);
	});

	it("after removing the deepest level, the anchor (depth 0) remains", () => {
		const levels = new Map<string, number>([["Bread", 0]]);
		traceStep(levels, "Bread", "up", 2);
		traceBack(levels, 2); // remove depth 2, leaving 0 and 1
		expect(levels.has("Bread")).toBe(true);
		expect(levels.get("Bread")).toBe(0);
	});

	it("repeated traceBack returns to just the anchor", () => {
		const levels = new Map<string, number>([["Iron Sword", 0]]);
		traceStep(levels, "Iron Sword", "up", 3);
		let d = 3;
		while (d > 0) {
			const r = traceBack(levels, d);
			d = r.newDepth;
		}
		// Only the anchor at depth 0 remains
		expect(levels.size).toBe(1);
		expect(levels.get("Iron Sword")).toBe(0);
	});

	it("nodes removed by traceBack were at the frontier boundary", () => {
		const levels = new Map<string, number>([["Iron Sword", 0]]);
		traceStep(levels, "Iron Sword", "up", 3);
		const maxDepth = 3;
		const frontier = [...levels.entries()].filter(([_, d]) => d === maxDepth).map(([id]) => id);

		const { removed } = traceBack(levels, maxDepth);
		// Removed nodes should exactly be the frontier at maxDepth
		expect(new Set(removed)).toEqual(new Set(frontier));
	});
});

describe("trace state persistence", () => {
	it("serialize/deserialize round-trips a Map with depth", () => {
		const levels = new Map<string, number>([
			["Bread", 0],
			["Flour", 1],
			["Wheat", 2],
		]);
		const json = serializeTrace("Bread", "up", levels, 2);
		const parsed = deserializeTrace(json);
		expect(parsed).not.toBeNull();
		expect(parsed!.root).toBe("Bread");
		expect(parsed!.dir).toBe("up");
		expect(parsed!.depth).toBe(2);
		expect(parsed!.levels.get("Bread")).toBe(0);
		expect(parsed!.levels.get("Flour")).toBe(1);
		expect(parsed!.levels.get("Wheat")).toBe(2);
	});

	it("serialization produces JSON-safe array (not Map)", () => {
		const levels = new Map<string, number>([["Bread", 0]]);
		const json = serializeTrace("Bread", "up", levels, 0);
		const obj = JSON.parse(json);
		// levels should be an array of [id, depth] pairs
		expect(Array.isArray(obj.levels)).toBe(true);
		expect(obj.levels).toEqual([["Bread", 0]]);
	});

	it("deserialize rejects missing root or dir", () => {
		expect(deserializeTrace('{"root":null,"dir":null,"levels":[],"depth":0}')).toBeNull();
		expect(deserializeTrace("corrupt json")).toBeNull();
	});

	it("empty trace (depth 0) serializes root-only correctly", () => {
		const levels = new Map<string, number>([["Bread", 0]]);
		const json = serializeTrace("Bread", "up", levels, 0);
		const parsed = deserializeTrace(json);
		expect(parsed).not.toBeNull();
		expect(parsed!.depth).toBe(0);
		expect(parsed!.levels.size).toBe(1);
	});
});
