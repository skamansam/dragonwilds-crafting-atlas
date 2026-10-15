// Checks the P4/P7 invariant: in the rendered graph, a node with no incoming
// edge (no source / ancestor / requirement) must be a region, a skill or a
// quest. Anything else is either a data gap or a missing overlay edge.
//
// Mirrors the app's edge construction in src/app.js: data edges, the region
// spokes (found-in.js + region-resources.js), the quest spokes (quests.js) and
// the quest→mount spokes (mounts.js). Run: node scripts/check-sources.mjs
import { readFileSync } from "node:fs";
import { CANON_REGIONS } from "../src/regions.js";

const load = (p, name) => {
	const src = readFileSync(new URL("../public/" + p, import.meta.url), "utf8");
	const w = {};
	new Function("window", src)(w);
	return w[name];
};

const D = load("data.js", "DW_DATA");
const F = load("found-in.js", "DW_FOUND_IN") || {};
const RR = load("region-resources.js", "DW_REGION_RESOURCES")?.regions || {};
const Q = load("quests.js", "DW_QUESTS") || {};
const M = load("mounts.js", "DW_MOUNTS") || {};

// the same list the app and the generators use — see src/regions.js
const CANON = CANON_REGIONS;

const kind = new Map(D.nodes.map((n) => [n.id, n.kind]));
const roster = new Map(Object.entries(M.mounts || {}));

// region overlays (app.js ~430-500): found-in prose, then the region pages'
// own resource lists — the same union, so a hub that only the second source
// knows about still counts as a region here
const regionMembers = new Map();
for (const [itemId, list] of Object.entries(F)) {
	for (const f of list) {
		if (!f.region || !CANON.includes(f.region)) continue;
		if (!regionMembers.has(f.region)) regionMembers.set(f.region, new Set());
		regionMembers.get(f.region).add(itemId);
	}
}
for (const [region, members] of Object.entries(RR)) {
	if (!CANON.includes(region)) continue;
	if (!regionMembers.has(region)) regionMembers.set(region, new Set());
	const set = regionMembers.get(region);
	for (const itemId of Object.keys(members)) set.add(itemId);
}
for (const r of CANON) {
	const m = regionMembers.get(r);
	const qs = Q.regionQuests?.[r] || [];
	if ((!m || !m.size) && !qs.length) continue; // app skips empty regions
	kind.set(r, "region");
}
for (const name of Q.order || []) if (Q.quests[name]) kind.set(name, "quest");

// indegree over the rendered graph
const inc = new Map([...kind.keys()].map((k) => [k, 0]));
const add = (t) => {
	if (inc.has(t)) inc.set(t, inc.get(t) + 1);
};
for (const e of D.edges) add(e.to); // craft + skill-level edges
for (const [r, set] of regionMembers)
	if (kind.get(r) === "region") for (const it of set) add(it);
for (const name of Q.order || []) {
	const q = Q.quests[name];
	if (!q) continue;
	for (const r of q.regions || []) if (kind.get(r) === "region") add(name);
	for (const rw of q.rewards || []) add(rw.item);
}
for (const [mid, m] of roster) {
	if (!kind.has(mid)) continue;
	for (const q of m.quests || []) if (kind.get(q) === "quest") add(mid);
}

const OK = new Set(["region", "skill", "quest"]);
const roots = [...inc].filter(([, v]) => v === 0).map(([id]) => id);
const bad = roots.filter((id) => !OK.has(kind.get(id)));

// why each offender is uncovered
const bucket = {
	"no found-in entry": 0,
	"found-in region all null": 0,
	"found-in region not canon": 0,
	"found-in canon region (real bug)": 0,
};
const methods = {};
for (const id of bad) {
	const list = F[id];
	if (!list || !list.length) {
		bucket["no found-in entry"]++;
		continue;
	}
	const regions = list.map((f) => f.region).filter(Boolean);
	if (!regions.length) bucket["found-in region all null"]++;
	else if (regions.some((r) => CANON.includes(r)))
		// a canon region should have emitted a region spoke and rescued this node —
		// landing here means the app-side edge build is out of step with this check
		bucket["found-in canon region (real bug)"]++;
	else bucket["found-in region not canon"]++;
	for (const f of list)
		methods[f.method || "(none)"] = (methods[f.method || "(none)"] || 0) + 1;
}

const byKind = {};
for (const id of bad) byKind[kind.get(id)] = (byKind[kind.get(id)] || 0) + 1;

console.log(`rendered nodes: ${kind.size}`);
console.log(
	`zero-ancestor nodes: ${roots.length} (ok: ${roots.length - bad.length})`,
);
console.log(`violations: ${bad.length}`);
console.log("  by kind:", JSON.stringify(byKind));
console.log("  by cause:", JSON.stringify(bucket));
console.log(
	"  gather methods on offenders:",
	JSON.stringify(Object.entries(methods).sort((a, b) => b[1] - a[1])),
);
if (process.argv.includes("--list"))
	console.log(bad.map((id) => `  ${id} [${kind.get(id)}]`).join("\n"));
process.exit(bad.length ? 1 : 0);
