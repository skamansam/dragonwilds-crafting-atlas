/**
 * Shared trace math — replicated pure functions from site/app.js traceStep()
 * and traceBack(). Used by both unit tests and cucumber spec files so the
 * Gherkin scenarios test the same logic that the unit tests cover.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load the production dataset for realistic edge cases
const dataPath = resolve(process.cwd(), "site", "data.json");
const D = JSON.parse(readFileSync(dataPath, "utf8"));
const nodeById = new Map(D.nodes.map((n) => [n.id, n]));

export { D, nodeById };

/**
 * Replicates traceStep's frontier collection: given the current traceLevels
 * map and traceDepth, collect the next depth of neighbours in `dir`,
 * skipping skill-gate spokes.
 */
export function collectFrontier(
	traceLevels: Map<string, number>,
	traceDepth: number,
	dir: "up" | "down"
): string[] {
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
 * Simulates traceStep: walk `clicks` levels from `root` in `dir`.
 * Returns the final traceLevels map and the depth reached.
 */
export function traceStep(
	traceLevels: Map<string, number>,
	root: string,
	dir: "up" | "down",
	clicks: number
): { levels: Map<string, number>; depth: number; exhaustedAt: number | null } {
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
	return { levels: traceLevels, depth: d, exhaustedAt };
}

/**
 * Replicates traceBack: drop the deepest level from traceLevels, decrement depth.
 * When depth would reach 0, delegate to clearTrace — removing ALL nodes
 * (including the anchor), matching app.js traceBack() → clearTrace() handoff.
 * Returns the set of removed node IDs and the new depth.
 */
export function traceBack(
	traceLevels: Map<string, number>,
	traceDepth: number
): { removed: string[]; newDepth: number } {
	const removed: string[] = [];
	if (traceDepth <= 1) {
		// Going to depth 0 — clear the entire trace (clearTrace delegation)
		for (const [nid] of traceLevels) {
			traceLevels.delete(nid);
			removed.push(nid);
		}
		return { removed, newDepth: 0 };
	}
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
 * Returns null for a cleared trace (empty levels or null root) — matching
 * app.js saveTrace() which removes the localStorage key when traceRoot === null.
 */
export function serializeTrace(
	root: string | null,
	dir: string | null,
	levels: Map<string, number>,
	depth: number
): string | null {
	if (root === null || levels.size === 0) return null;
	return JSON.stringify({
		root,
		dir,
		levels: Array.from(levels.entries()),
		depth,
	});
}

/**
 * Deserializes trace state from localStorage.
 */
export function deserializeTrace(str: string | null): {
	root: string | null;
	dir: "up" | "down";
	levels: Map<string, number>;
	depth: number;
} | null {
	if (!str) return null;
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

export function nodeExists(id: string): boolean {
	return nodeById.has(id);
}
