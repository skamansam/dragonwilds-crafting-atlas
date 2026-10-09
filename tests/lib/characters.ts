/**
 * Shared per-character state math — replicated from src/characters.js (TODO #24).
 *
 * The site keeps a character roster in localStorage (`dw.characters`). Each
 * character has a name, one level per skill and its OWN graph state — the live
 * `dw.*` keys are the active character's, and switching snapshots the outgoing
 * character out and applies the incoming one in. These helpers are the exact
 * rules the page ships, so the Gherkin scenarios assert the real behaviour over
 * a fake in-memory storage.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dataPath = resolve(process.cwd(), "public", "data.json");
const D = JSON.parse(readFileSync(dataPath, "utf8")) as {
	skills: { name: string }[];
};

export const SKILL_NAMES: string[] = D.skills.map((s) => s.name);
export const SKILL_MIN = 1;
export const SKILL_MAX = 99;
export const KEY = "dw.characters";
export const PROMPTED_KEY = "dw.charPrompted";

export const STATE_KEYS = [
	"layout", "dens", "animate", "savedLayouts", "worker", "autoRelayout",
	"showMatEdges", "showSkillEdges", "showRegionEdges", "legendKinds",
	"showOrphans", "owned", "planMode", "planUseOwned", "wpProgress",
	"isoDepth", "isoDir", "highlight", "force",
];

/* ── a localStorage stand-in ──────────────────────────────────────── */
export interface KVStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export function fakeStore(seed: Record<string, string> = {}): KVStore {
	const map = new Map<string, string>(Object.entries(seed));
	return {
		getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
		setItem: (k, v) => void map.set(k, String(v)),
		removeItem: (k) => void map.delete(k),
	};
}

/* ── skill levels ─────────────────────────────────────────────────── */
export function clampLevel(v: unknown): number {
	const n = parseInt(String(v), 10);
	if (!Number.isFinite(n)) return SKILL_MIN;
	return Math.max(SKILL_MIN, Math.min(SKILL_MAX, n));
}

export function blankSkills(names: string[] = SKILL_NAMES): Record<string, number> {
	const out: Record<string, number> = {};
	for (const n of names) out[n] = SKILL_MIN;
	return out;
}

export function normSkills(
	input: unknown,
	names: string[] = SKILL_NAMES,
): Record<string, number> {
	const out = blankSkills(names);
	if (input && typeof input === "object") {
		for (const n of Object.keys(out)) {
			const v = (input as Record<string, unknown>)[n];
			if (v !== undefined && v !== null) out[n] = clampLevel(v);
		}
	}
	return out;
}

export function totalLevel(
	skills: unknown,
	names: string[] = SKILL_NAMES,
): number {
	return Object.values(normSkills(skills, names)).reduce((a, b) => a + b, 0);
}

export function cleanName(name: unknown): string {
	const n = String(name == null ? "" : name).trim().slice(0, 40);
	return n || "Adventurer";
}

/* ── roster ───────────────────────────────────────────────────────── */
export interface Character {
	id: string;
	name: string;
	skills: Record<string, number>;
	state: Record<string, string> | null;
	createdAt: number;
}

export interface Store {
	active: string | null;
	chars: Character[];
}

export function emptyStore(): Store {
	return { active: null, chars: [] };
}

export function normalizeStore(raw: unknown, names: string[] = SKILL_NAMES): Store {
	const out = emptyStore();
	if (!raw || typeof raw !== "object" || !Array.isArray((raw as Store).chars)) {
		return out;
	}
	const seen = new Set<string>();
	for (const c of (raw as Store).chars) {
		if (!c || typeof c !== "object" || !c.id || seen.has(c.id)) continue;
		seen.add(c.id);
		out.chars.push({
			id: String(c.id),
			name: cleanName(c.name),
			skills: normSkills(c.skills, names),
			state: c.state && typeof c.state === "object" ? c.state : null,
			createdAt: Number(c.createdAt) || 0,
		});
	}
	if (out.chars.some((c) => c.id === (raw as Store).active)) {
		out.active = (raw as Store).active as string;
	}
	return out;
}

export function read(s: KVStore, names: string[] = SKILL_NAMES): Store {
	try {
		return normalizeStore(JSON.parse(s.getItem(KEY) || "null"), names);
	} catch {
		return emptyStore();
	}
}

export function write(data: Store, s: KVStore): void {
	s.setItem(KEY, JSON.stringify(data));
}

export function findChar(data: Store, id: string | null): Character | null {
	return data.chars.find((c) => c.id === id) || null;
}

export function activeCharacter(s: KVStore, names: string[] = SKILL_NAMES): Character | null {
	const data = read(s, names);
	return findChar(data, data.active);
}

export function skillOf(ch: Character | null, name: string, names: string[] = SKILL_NAMES): number | null {
	if (!ch) return null;
	const skills = normSkills(ch.skills, names);
	return skills[name] ?? null;
}

/* ── live dw.* state swap ─────────────────────────────────────────── */
export function snapshotState(s: KVStore): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of STATE_KEYS) {
		const v = s.getItem("dw." + k);
		if (v !== null) out[k] = v;
	}
	return out;
}

export function applyState(state: Record<string, string> | null, s: KVStore): void {
	for (const k of STATE_KEYS) {
		if (state && Object.hasOwn(state, k)) s.setItem("dw." + k, state[k]);
		else s.removeItem("dw." + k);
	}
}

export function hasLiveState(s: KVStore): boolean {
	return STATE_KEYS.some((k) => s.getItem("dw." + k) !== null);
}

/* ── operations ───────────────────────────────────────────────────── */
let uidSeq = 0;
function uid(): string {
	uidSeq += 1;
	return `c${uidSeq}`;
}

export function create(
	name: unknown,
	opts: { adopt?: boolean } = {},
	s: KVStore,
	names: string[] = SKILL_NAMES,
): Character {
	const data = read(s, names);
	const cur = findChar(data, data.active);
	if (cur) cur.state = snapshotState(s);
	const ch: Character = {
		id: uid(),
		name: cleanName(name),
		skills: blankSkills(names),
		state: null,
		createdAt: 1700000000000,
	};
	if (opts.adopt) ch.state = snapshotState(s);
	else applyState(null, s);
	data.chars.push(ch);
	data.active = ch.id;
	write(data, s);
	return ch;
}

export function activate(id: string, s: KVStore, names: string[] = SKILL_NAMES): Character | null {
	const data = read(s, names);
	const cur = findChar(data, data.active);
	if (cur) cur.state = snapshotState(s);
	const next = findChar(data, id);
	if (next) {
		applyState(next.state, s);
		data.active = next.id;
	} else {
		applyState(null, s);
		data.active = null;
	}
	write(data, s);
	return next;
}

export function remove(id: string, s: KVStore, names: string[] = SKILL_NAMES): Store {
	const data = read(s, names);
	const wasActive = data.active === id;
	data.chars = data.chars.filter((c) => c.id !== id);
	if (wasActive) {
		const next = data.chars[0] || null;
		data.active = next ? next.id : null;
		applyState(next ? next.state : null, s);
	}
	write(data, s);
	return data;
}

export function rename(id: string, name: unknown, s: KVStore, names: string[] = SKILL_NAMES): Character | null {
	const data = read(s, names);
	const ch = findChar(data, id);
	if (ch) {
		ch.name = cleanName(name);
		write(data, s);
	}
	return ch;
}

export function setSkill(
	name: string,
	level: unknown,
	s: KVStore,
	id?: string,
	names: string[] = SKILL_NAMES,
): { char: Character; total: number } | null {
	const data = read(s, names);
	const ch = findChar(data, id || data.active);
	if (!ch) return null;
	ch.skills = normSkills(ch.skills, names);
	ch.skills[name] = clampLevel(level);
	write(data, s);
	return { char: ch, total: totalLevel(ch.skills, names) };
}

export function promptShown(s: KVStore): boolean {
	return s.getItem(PROMPTED_KEY) === "1";
}

export function markPrompted(s: KVStore): void {
	s.setItem(PROMPTED_KEY, "1");
}
