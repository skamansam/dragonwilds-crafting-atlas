/**
 * Shared URL-routing math — replicated pure functions from site/routing.js
 * (slug, buildIndex, parseHash, buildHash). The Gherkin routing scenarios drive
 * these, so the exact slug rules the site ships are what the tests assert.
 *
 * Item identity in a URL is the snake_case slug of the display name
 * ("Iron Sword" → iron_sword); the internal node ids stay the display names.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// the production dataset, so the index/collision scenarios test real names
const dataPath = resolve(process.cwd(), "site", "data.json");
const D = JSON.parse(readFileSync(dataPath, "utf8"));

export { D };

export function slug(name: string): string {
	return String(name)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[\u2018\u2019\u02bc'’‘"]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export interface SlugIndex {
	toId: Map<string, string>;
	toSlug: Map<string, string>;
}

export function buildIndex(nodes: { id: string; name: string }[]): SlugIndex {
	const toId = new Map<string, string>();
	const toSlug = new Map<string, string>();
	for (const n of nodes) {
		const base = slug(n.name);
		let s = base;
		for (let i = 2; toId.has(s); i++) s = `${base}_${i}`;
		toId.set(s, n.id);
		toSlug.set(n.id, s);
	}
	return { toId, toSlug };
}

export function parseHash(hash: string): { segments: string[] } {
	let h = String(hash || "");
	const i = h.indexOf("#");
	if (i >= 0) h = h.slice(i + 1);
	const segments = h
		.split("/")
		.map((seg) => {
			try {
				seg = decodeURIComponent(seg);
			} catch {
				/* keep raw on a bad escape */
			}
			return seg.trim().toLowerCase();
		})
		.filter(Boolean);
	return { segments };
}

export function buildHash(slugs: (string | undefined | null)[]): string {
	const parts = (slugs || []).filter(Boolean) as string[];
	return parts.length ? `#/${parts.join("/")}` : "#/";
}

/* ── graph options in the query string (mirrors site/routing.js) ────────── */

type OptionKind =
	| "bool"
	| "int"
	| "enum"
	| "layout"
	| "kinds"
	| "slug"
	| "depth";

interface OptionParam {
	name: string;
	kind: OptionKind;
	min?: number;
	max?: number;
	values?: string[];
}

// canonical order — also the order buildOptionsQuery writes
const OPTION_PARAMS: OptionParam[] = [
	{ name: "layout", kind: "layout" },
	{ name: "force", kind: "bool" },
	{ name: "anim", kind: "bool" },
	{ name: "saved", kind: "bool" },
	{ name: "worker", kind: "bool" },
	{ name: "dens", kind: "int", min: 50, max: 200 },
	{ name: "auto", kind: "bool" },
	{ name: "cats", kind: "kinds" },
	{ name: "orphans", kind: "bool" },
	{ name: "links", kind: "bool" },
	{ name: "skilllinks", kind: "bool" },
	{ name: "regions", kind: "bool" },
	{ name: "possessions", kind: "bool" },
	{ name: "iso", kind: "slug" },
	{ name: "isodir", kind: "enum", values: ["both", "down", "needs", "up"] },
	{ name: "isodepth", kind: "depth" },
];

export const OPTION_NAMES = OPTION_PARAMS.map((p) => p.name);

const BOOL_ON = /^(1|true|yes|on)$/i;
const BOOL_OFF = /^(0|false|no|off)$/i;
const TOKEN = /^[a-z0-9_-]+$/;

export function parseOptions(
	search: string,
	{ layouts = [], kinds = [] }: { layouts?: string[]; kinds?: string[] } = {},
): { values: Map<string, string>; invalid: string[] } {
	const q = new URLSearchParams(search || "");
	const values = new Map<string, string>();
	const invalid: string[] = [];
	for (const p of OPTION_PARAMS) {
		if (!q.has(p.name)) continue;
		const raw = String(q.get(p.name) ?? "")
			.trim()
			.toLowerCase();
		let v: string | null = null;
		if (p.kind === "bool") {
			if (raw === "" || BOOL_ON.test(raw)) v = "1";
			else if (BOOL_OFF.test(raw)) v = "0";
		} else if (p.kind === "int") {
			const n = Number(raw);
			if (raw !== "" && Number.isFinite(n))
				v = String(
					Math.min(p.max as number, Math.max(p.min as number, Math.round(n))),
				);
		} else if (p.kind === "enum") {
			if ((p.values as string[]).includes(raw)) v = raw;
		} else if (p.kind === "layout") {
			if (layouts.includes(raw)) v = raw;
		} else if (p.kind === "kinds") {
			if (raw === "all" || raw === "none") v = raw;
			else {
				const keep = [
					...new Set(
						raw
							.split(",")
							.map((s) => s.trim())
							.filter((t) => kinds.includes(t)),
					),
				];
				if (keep.length) v = keep.join(",");
			}
		} else if (p.kind === "slug") {
			if (TOKEN.test(raw)) v = raw;
		} else if (p.kind === "depth") {
			if (raw === "all") v = "all";
			else {
				const n = parseInt(raw, 10);
				if (Number.isFinite(n) && n >= 1) v = String(n);
			}
		}
		if (v === null) invalid.push(p.name);
		else values.set(p.name, v);
	}
	return { values, invalid };
}

export function buildOptionsQuery(
	state: Record<string, string | null | undefined>,
): string {
	const q = new URLSearchParams();
	for (const p of OPTION_PARAMS) {
		const v = (state || {})[p.name];
		if (v === undefined || v === null || v === "") continue;
		q.set(p.name, String(v));
	}
	return q.toString();
}
