/**
 * Shared highlight math — replicated pure functions from site/app.js
 * expandHighlight() and stepBackHighlight(). Used by the cucumber spec files so
 * the Gherkin scenarios test the same logic the live app runs.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load the production dataset for realistic edge cases
const dataPath = resolve(process.cwd(), "site", "data.json");
const D = JSON.parse(readFileSync(dataPath, "utf8"));
const nodeById = new Map(D.nodes.map((n) => [n.id, n]));

export { D, nodeById };

/**
 * Replicates expandHighlight's frontier collection: given the current
 * highlightLevels map and highlightDepth, collect the next depth of neighbours
 * in `dir`, skipping skill-gate spokes.
 */
export function collectFrontier(
	highlightLevels: Map<string, number>,
	highlightDepth: number,
	dir: "up" | "down"
): string[] {
	const next: string[] = [];
	for (const [nid, d] of highlightLevels) {
		if (d !== highlightDepth) continue;
		for (const e of D.edges) {
			const nb =
				dir === "down"
					? e.from === nid
						? e.to
						: null
					: e.to === nid
						? e.from
						: null;
			if (nb === null || highlightLevels.has(nb)) continue;
			// skill-gate edges (skill → unlocks) must not join the walk
			const src = dir === "down" ? nid : nb;
			if (nodeById.get(src)?.kind === "skill") continue;
			// Facility-aware frontier (TODO #23): for upstream REQUIRES walks the
			// recipe's crafting station is a prerequisite at the same depth — collect
			// it when the facility resolves to a station/tool node and isn't highlighted.
			if (dir === "up" && e.facility && !highlightLevels.has(e.facility)) {
				const fnode = nodeById.get(e.facility);
				if (fnode && (fnode.kind === "station" || fnode.kind === "tool")) {
					highlightLevels.set(e.facility, d + 1);
					next.push(e.facility);
				}
			}
			highlightLevels.set(nb, d + 1);
			next.push(nb);
		}
	}
	return next;
}

/**
 * Simulates expandHighlight: walk `clicks` levels from `root` in `dir`.
 * Returns the final highlightLevels map and the depth reached.
 */
export function expandHighlight(
	highlightLevels: Map<string, number>,
	root: string,
	dir: "up" | "down",
	clicks: number
): { levels: Map<string, number>; depth: number; exhaustedAt: number | null } {
	let d = 0;
	let exhaustedAt: number | null = null;
	highlightLevels.set(root, 0);
	for (let c = 1; c <= clicks; c++) {
		const next = collectFrontier(highlightLevels, d, dir);
		if (!next.length) {
			exhaustedAt = c - 1;
			break;
		}
		d++;
	}
	return { levels: highlightLevels, depth: d, exhaustedAt };
}

/**
 * Replicates stepBackHighlight: drop the deepest level from highlightLevels,
 * decrement depth. When depth would reach 0, delegate to clearHighlight —
 * removing ALL nodes (including the anchor), matching app.js
 * stepBackHighlight() → clearHighlight() handoff.
 * Returns the set of removed node IDs and the new depth.
 */
export function stepBackHighlight(
	highlightLevels: Map<string, number>,
	highlightDepth: number
): { removed: string[]; newDepth: number } {
	const removed: string[] = [];
	if (highlightDepth <= 1) {
		// Going to depth 0 — clear the entire highlight (clearHighlight delegation)
		for (const [nid] of highlightLevels) {
			highlightLevels.delete(nid);
			removed.push(nid);
		}
		return { removed, newDepth: 0 };
	}
	for (const [nid, d] of highlightLevels) {
		if (d === highlightDepth) {
			highlightLevels.delete(nid);
			removed.push(nid);
		}
	}
	return { removed, newDepth: highlightDepth - 1 };
}

/**
 * Serializes highlight state for localStorage persistence (dw.highlight key).
 * Returns null for a cleared highlight (empty levels or null root) — matching
 * app.js saveHighlight() which removes the localStorage key when highlightRoot === null.
 */
export function serializeHighlight(
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
 * Deserializes highlight state from localStorage.
 */
export function deserializeHighlight(str: string | null): {
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
