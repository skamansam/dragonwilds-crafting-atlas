/**
 * Cucumber/Gherkin spec for per-character state (TODO #24).
 *
 * Every step drives the helpers in tests/lib/characters.ts, which mirror the
 * shipped rules in site/characters.js. The real page keeps the roster in
 * localStorage and stores each character's graph state in the live `dw.*` keys;
 * these scenarios run the same logic over a fake in-memory storage.
 *
 * NOTE: @amiceli/vitest-cucumber calls each step fn as fn(ctx, ...params), so
 * parameterized steps ({string}, {int}) must declare a _ctx placeholder first.
 * A step's declared keyword must match the feature line's (a `Then` definition
 * does not satisfy an `And` line), and a step's text may appear only once per
 * scenario.
 */

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
	activate,
	activeCharacter,
	type Character,
	create,
	fakeStore,
	type KVStore,
	markPrompted,
	promptShown,
	read,
	remove,
	setSkill,
	skillOf,
	totalLevel,
} from "../lib/characters";

const feature = await loadFeature("./characters.feature");

interface CharState {
	store: KVStore;
	created: Character | null;
}

let state: CharState;

function fresh(): void {
	state = { store: fakeStore(), created: null };
}

const idFor = (name: string): string => {
	const ch = read(state.store).chars.find((c) => c.name === name);
	if (!ch) throw new Error(`no character named ${name}`);
	return ch.id;
};

/* ── shared step handlers ─────────────────────────────────────────── */
const stepCreate = async (_ctx: unknown, name: string) => { state.created = create(name, {}, state.store); };
const stepAlsoCreate = async (_ctx: unknown, name: string) => { state.created = create(name, {}, state.store); };
const stepCreateAdopt = async (_ctx: unknown, name: string) => { state.created = create(name, { adopt: true }, state.store); };
const stepCreateClean = async (_ctx: unknown, name: string) => { state.created = create(name, { adopt: false }, state.store); };
const stepSetLevel = async (_ctx: unknown, skill: string, level: number) => { setSkill(skill, level, state.store); };
const stepSetLiveLayout = async (_ctx: unknown, layout: string) => { state.store.setItem("dw.layout", layout); };
const stepSavedLayout = async (_ctx: unknown, layout: string) => { state.store.setItem("dw.layout", layout); };
const stepMarkOwned = async (_ctx: unknown, item: string) => { state.store.setItem("dw.owned", JSON.stringify([item])); };
const stepSavedLedger = async (_ctx: unknown, item: string) => { state.store.setItem("dw.owned", JSON.stringify([item])); };
const stepSwitch = async (_ctx: unknown, name: string) => { activate(idFor(name), state.store); };
const stepDeleteActive = async () => { const a = activeCharacter(state.store); if (a) remove(a.id, state.store); };
const stepMarkPrompted = async () => { markPrompted(state.store); };
const stepGivenRoster = async () => {
	state.store.setItem(
		"dw.characters",
		JSON.stringify({
			active: "a",
			chars: [
				{ id: "a", name: "", skills: {} },
				{ id: "a", name: "Duplicate", skills: {} },
			],
		}),
	);
};

const thenLevel = async (_ctx: unknown, skill: string, want: number) => {
	expect(skillOf(activeCharacter(state.store), skill)).toBe(want);
};
const thenTotal = async (_ctx: unknown, want: number) => {
	const ch = activeCharacter(state.store);
	expect(ch).not.toBeNull();
	expect(totalLevel((ch as Character).skills)).toBe(want);
};
const thenActiveNamed = async (_ctx: unknown, want: string) => {
	expect(activeCharacter(state.store)?.name).toBe(want);
};
const thenNoLayout = async () => { expect(state.store.getItem("dw.layout")).toBeNull(); };
const thenLiveLayout = async (_ctx: unknown, layout: string) => {
	expect(state.store.getItem("dw.layout")).toBe(layout);
};
const thenOwnedEmpty = async () => { expect(state.store.getItem("dw.owned")).toBeNull(); };
const thenOwnedContains = async (_ctx: unknown, item: string) => {
	expect(JSON.parse(state.store.getItem("dw.owned") || "[]")).toContain(item);
};
const thenRosterValid = async () => {
	const data = read(state.store);
	expect(data.chars.length).toBe(1);
	expect(data.chars[0].name).toBe("Adventurer");
	expect(data.active).toBe("a");
};
const thenPromptNotShown = async () => { expect(promptShown(state.store)).toBe(false); };
const thenPromptShown = async () => { expect(promptShown(state.store)).toBe(true); };

describeFeature(feature, ({ Background, Scenario }) => {
	Background(({ Given }) => {
		Given("a fresh browser store", async () => {
			fresh();
		});
	});

	/* ── skill levels ────────────────────────────────────────────────── */

	Scenario("A new character starts at level 1 in every skill", ({ When, Then, And }) => {
		When("I create a character named {string}", stepCreate);
		Then("the level in {string} is {int}", thenLevel);
		And("the total level is {int}", thenTotal);
	});

	Scenario("Raising a skill level raises the total", ({ When, Then, And }) => {
		When("I create a character named {string}", stepCreate);
		And("I set the level in {string} to {int}", stepSetLevel);
		Then("the level in {string} is {int}", thenLevel);
		And("the total level is {int}", thenTotal);
	});

	Scenario("A level above the maximum is clamped", ({ When, Then, And }) => {
		When("I create a character named {string}", stepCreate);
		And("I set the level in {string} to {int}", stepSetLevel);
		Then("the level in {string} is {int}", thenLevel);
		And("the total level is {int}", thenTotal);
	});

	Scenario("A level below the minimum is raised to the minimum", ({ When, Then, And }) => {
		When("I create a character named {string}", stepCreate);
		And("I set the level in {string} to {int}", stepSetLevel);
		Then("the level in {string} is {int}", thenLevel);
	});

	Scenario("A blank name falls back to a default", ({ When, Then }) => {
		When("I create a character named {string}", stepCreate);
		Then("the active character is named {string}", thenActiveNamed);
	});

	/* ── per-character graph state ───────────────────────────────────── */

	Scenario("Each character keeps its own graph state", ({ When, Then, And }) => {
		When("I create a character named {string}", stepCreate);
		And("I set the live layout to {string}", stepSetLiveLayout);
		And("I mark {string} as owned", stepMarkOwned);
		And("I also create a character named {string}", stepAlsoCreate);
		Then("no live layout is chosen", thenNoLayout);
		And("the owned ledger is empty", thenOwnedEmpty);
		When("I switch to the character named {string}", stepSwitch);
		Then("the live layout is {string}", thenLiveLayout);
		And("the owned ledger contains {string}", thenOwnedContains);
	});

	Scenario("Creating a character can adopt the existing saved data", ({ Given, When, Then, And }) => {
		Given("the saved layout is {string}", stepSavedLayout);
		And("the saved ledger contains {string}", stepSavedLedger);
		When("adopting the current data, I create a character named {string}", stepCreateAdopt);
		Then("the live layout is {string}", thenLiveLayout);
		And("the owned ledger contains {string}", thenOwnedContains);
		When("starting clean, I create a character named {string}", stepCreateClean);
		Then("no live layout is chosen", thenNoLayout);
		And("the owned ledger is empty", thenOwnedEmpty);
	});

	Scenario("Deleting the active character falls back to another", ({ When, Then, And }) => {
		When("I create a character named {string}", stepCreate);
		And("I also create a character named {string}", stepAlsoCreate);
		When("I delete the active character", stepDeleteActive);
		Then("the active character is named {string}", thenActiveNamed);
	});

	/* ── roster hygiene ──────────────────────────────────────────────── */

	Scenario("Corrupt or duplicate roster entries are dropped", ({ Given, Then }) => {
		Given("a roster with a duplicate id and a nameless character", stepGivenRoster);
		Then("the roster holds only the valid characters", thenRosterValid);
	});

	Scenario("The prompt is remembered once answered", ({ When, Then }) => {
		Then("the character prompt has not been shown", thenPromptNotShown);
		When("I mark the character prompt as shown", stepMarkPrompted);
		Then("the character prompt has been shown", thenPromptShown);
	});
});
