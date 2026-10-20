// Builds public/map-links.js — the atlas nodes that can hand a reader to the
// live Wyrmwatch map, pre-filtered to that node's own marker type.
//
// Where the numbers come from: the Wyrmwatch map's own reference file
// (wyrmwatch-reference-<snapshot>.json, ~4.7 MB), which carries every region
// label, all 25,298 marker positions and the 235 type keys it draws. It is
// published by survivalservers.com, whose own page records that it is derived
// from MetaForge's public map API. The atlas takes only what it cannot draw
// itself — a marker type per node and the view that frames it — and nothing at
// runtime: the artifact is a static JS file like the other overlays.
//
// This file is CACHED, not committed: `cache/` is gitignored like the wiki raw
// cache, and the reference is ~4.7 MB of someone else's data. The generator
// reads cache/wyrmwatch/reference.json when it is there.
//
//   node scripts/build-map-links.mjs                    # from the cached reference
//   node scripts/build-map-links.mjs --refresh          # re-download it first
//   node scripts/build-map-links.mjs --file=/tmp/ref.json
//   node scripts/build-map-links.mjs --check            # drift guard (see below)
//
// Fetching needs no key, but the host answers a scripted request with a
// Cloudflare challenge (HTTP 403, whatever User-Agent we send). The file can be
// saved from a browser instead — open the map, then
//   fetch('/themes/epona/images/sspanel/wyrmwatch-reference-<snapshot>.json')
//     .then(r => r.text()).then(t => copy(t))
// in its console and paste it into cache/wyrmwatch/reference.json. `--check`
// treats a missing reference as unjudged (the same way the region overlay
// treats an unreachable wiki page), so CI never fails over someone else's
// downtime.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMapLinks } from "./map-links-core.mjs";
import { USER_AGENT } from "./wiki-config.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OVERLAY = path.join(ROOT, "public", "map-links.js");
const CACHE = path.join(ROOT, "cache", "wyrmwatch", "reference.json");
const DATASET = path.join(ROOT, "public", "data.json");

const MAP_URL =
	"https://www.survivalservers.com/share/runescape-dragonwilds/wyrmwatch/ashenfall";
// the snapshot the atlas is built against; bump it (and re-run) when the map
// publishes a newer one, which it announces as wyrmwatch-reference-<date>.json
const REFERENCE_URL =
	"https://www.survivalservers.com/themes/epona/images/sspanel/wyrmwatch-reference-20260914.json";
const ATTRIBUTION =
	"Positions from the Wyrmwatch map by SurvivalServers (its own page credits MetaForge's map API); map artwork © Jagex";

const args = process.argv.slice(2);
const check = args.includes("--check");
const offline = args.includes("--offline");
const refresh = args.includes("--refresh");
const fileArg = args.find((a) => a.startsWith("--file="));

/** The cached reference text, or null when this run has none. */
function cachedText() {
	const p = fileArg ? fileArg.slice("--file=".length) : CACHE;
	try {
		return { text: fs.readFileSync(p, "utf8"), from: p };
	} catch {
		return null;
	}
}

async function fetchReference() {
	const res = await fetch(REFERENCE_URL, {
		headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
	});
	if (!res.ok)
		throw new Error(
			`${REFERENCE_URL} answered HTTP ${res.status}` +
				(res.status === 403
					? " — the host serves a Cloudflare challenge to scripts; save the file from a browser instead (see the header of this script)"
					: ""),
		);
	const text = await res.text();
	fs.mkdirSync(path.dirname(CACHE), { recursive: true });
	fs.writeFileSync(CACHE, text);
	return { text, from: CACHE };
}

let source = cachedText();
if ((!source || refresh) && !offline) {
	if (refresh) console.log("fetching the reference…");
	try {
		source = await fetchReference();
	} catch (e) {
		console.error(`could not fetch the map reference: ${e.message}`);
		if (!source) process.exit(1);
		console.warn("falling back to the cached copy");
	}
}
if (!source) source = cachedText(); // --refresh with no cache to fall back on

// --check must still be able to run where the reference cannot be had (CI has
// no cache and the host refuses scripts), so a missing source is reported as
// unjudged there rather than fatal — but there is nothing to GENERATE from.
if (!source && !check) {
	console.error(
		`no map reference: put it at ${path.relative(ROOT, CACHE)} ` +
			"(or pass --file=<path>) — see the header of this script for how to save it",
	);
	process.exit(1);
}

/* ── the payload ────────────────────────────────────────────────── */

const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));
let artifact = null;
let sha256 = null;
let report = null;
if (source) {
	const reference = JSON.parse(source.text);
	if (!Array.isArray(reference.groups) || !Array.isArray(reference.points))
		throw new Error(`${source.from} is not a wyrmwatch reference file`);
	sha256 = crypto.createHash("sha256").update(source.text).digest("hex");
	({ artifact, report } = buildMapLinks({
		reference,
		nodes: dataset.nodes,
		sourceUrl: MAP_URL,
		referenceUrl: REFERENCE_URL,
		snapshot: reference.snapshot || null,
		sha256,
		attribution: ATTRIBUTION,
	}));
}

/* ── --check: drift + internal consistency ────────────────────────
   Two different questions, and only the first needs the 4.7 MB source:

   · drift — does the committed artifact still match the reference file this run
     has? Without a reference that question is unjudged, and unjudged is
     reported, not failed: the same call the region overlay makes for a wiki
     page it could not fetch.
   · consistency — does the committed artifact still describe THIS dataset?
     Every id it names must still be a node (data.json is rebuilt on its own
     schedule, and an id that has gone leaves a link that opens nothing), every
     type key it filters on must be in its own type table, and every view must
     be a real place. That needs no source, so it is checked every time. */

const readOverlay = () => {
	const src = fs.readFileSync(OVERLAY, "utf8");
	return JSON.parse(/window\.DW_MAP_LINKS\s*=\s*(\{[\s\S]*\});/.exec(src)[1]);
};

const header = (payloadJson) =>
	`${[
		"// Live map links: generated by scripts/build-map-links.mjs from the",
		"// Wyrmwatch map's own reference file (survivalservers.com) — which atlas",
		"// node opens the live map on which of that map's marker types, and the view",
		"// that frames it. data.json is untouched: this is an overlay, read by",
		"// src/map-links.js and nothing else.",
		"//",
		`// snapshot ${artifact.source.snapshot} · sha256 ${sha256.slice(0, 16)}…`,
		`// ${ATTRIBUTION}.`,
		`window.DW_MAP_LINKS = ${payloadJson};`,
	].join("\n")}\n`;

let failed = false;
if (check) {
	const committed = readOverlay();
	const ids = new Set(dataset.nodes.map((n) => n.id));
	const problems = [];
	const stale = Object.keys(committed.nodes || {}).filter((id) => !ids.has(id));
	if (stale.length)
		problems.push(
			`${stale.length} linked node(s) are no longer in data.json: ${stale.slice(0, 6).join(", ")}${stale.length > 6 ? ", …" : ""}`,
		);
	for (const [id, entry] of Object.entries(committed.nodes || {})) {
		if (!Array.isArray(entry.keys) || !entry.keys.length)
			problems.push(`${id} links no marker type`);
		else {
			const missing = entry.keys.filter((k) => !committed.types?.[k]);
			if (missing.length)
				problems.push(
					`${id} filters on unlisted type(s) ${missing.join(", ")}`,
				);
		}
		const v = entry.view || {};
		const inside =
			Number.isFinite(v.x) &&
			Number.isFinite(v.y) &&
			Number.isFinite(v.zoom) &&
			v.zoom >= -3 &&
			v.zoom <= 7;
		if (!inside)
			problems.push(`${id} has an unusable view ${JSON.stringify(v)}`);
	}
	if (problems.length) {
		failed = true;
		console.log("DRIFT: public/map-links.js no longer describes this dataset");
		for (const p of problems.slice(0, 12)) console.log(`  ${p}`);
		console.log("\n  Regenerate and commit: node scripts/build-map-links.mjs");
	} else {
		console.log(
			`consistent: ${Object.keys(committed.nodes || {}).length} linked node(s) all exist in data.json`,
		);
	}

	if (!source) {
		console.log(
			"unjudged: no map reference this run — the committed artifact is not compared against survivalservers' file",
		);
	} else {
		const mine = JSON.stringify(artifact);
		const theirs = JSON.stringify({
			source: committed.source,
			types: committed.types,
			nodes: committed.nodes,
		});
		if (mine === theirs) {
			console.log(
				"up to date: public/map-links.js matches the map's reference",
			);
		} else {
			failed = true;
			console.log(
				"DRIFT: public/map-links.js no longer matches the map's reference",
			);
			const a = artifact.nodes;
			const b = committed.nodes || {};
			const added = Object.keys(a).filter((id) => !b[id]);
			const gone = Object.keys(b).filter((id) => !a[id]);
			if (added.length) console.log(`  new links: ${added.join(", ")}`);
			if (gone.length) console.log(`  links gone: ${gone.join(", ")}`);
			for (const id of Object.keys(a).filter((k) => b[k])) {
				if (JSON.stringify(a[id]) !== JSON.stringify(b[id]))
					console.log(
						`  ${id} changed: ${JSON.stringify(b[id])} → ${JSON.stringify(a[id])}`,
					);
			}
			const newTypes = Object.keys(artifact.types).filter(
				(k) => !committed.types?.[k],
			);
			const oldTypes = Object.keys(committed.types || {}).filter(
				(k) => !artifact.types[k],
			);
			if (newTypes.length)
				console.log(`  new marker types: ${newTypes.join(", ")}`);
			if (oldTypes.length)
				console.log(`  marker types gone: ${oldTypes.join(", ")}`);
			console.log(
				"\n  Regenerate and commit: node scripts/build-map-links.mjs",
			);
		}
	}
} else {
	const payload = { ...artifact, generatedAt: new Date().toISOString() };
	fs.writeFileSync(OVERLAY, header(JSON.stringify(payload)));
}

/* ── report ─────────────────────────────────────────────────────── */

if (artifact) {
	console.log(
		`\n${check ? "checked" : "wrote"} public/map-links.js — ` +
			`${report.nodesLinked} node(s) link to ${report.typesUsed}/${report.catalogue} marker types, ` +
			`${report.pins} markers behind them`,
	);
	console.log(
		`  resources with a map: ${report.resources.linked}/${report.resources.total}` +
			(report.unlinkedResources.length
				? ` (no counterpart on the map: ${report.unlinkedResources.join(", ")})`
				: ""),
	);
	console.log(
		`  snapshot ${artifact.source.snapshot} · sha256 ${sha256.slice(0, 16)}… · ${path.relative(ROOT, OVERLAY)}`,
	);
}
process.exit(failed ? 1 : 0);
