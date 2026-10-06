/**
 * Cucumber/Gherkin spec for the graph options carried in the query string.
 *
 * Every step drives parseOptions/buildOptionsQuery from tests/lib/routing.ts,
 * which mirror the shipped logic in site/routing.js. app.js only wires the
 * parsed values into its state (and never persists them), so this file is the
 * single home for the validation/round-trip rules.
 *
 *   ?layout=grid&cats=food,weapon&orphans=1&iso=iron_sword&isodir=up&isodepth=2
 *
 * Rule of thumb being tested: a value the URL gives wins over the visitor's
 * stored pref, an unusable value is dropped (and reported) instead of silently
 * ignored, and building the URL out always describes the WHOLE state so a
 * recipient gets exactly the sender's view.
 *
 * NOTE: @amiceli/vitest-cucumber calls each step fn as fn(ctx, ...params), so
 * parameterized steps ({string}, {int}) must declare a _ctx placeholder first.
 * A step's text may appear only ONCE per scenario (one callback per occurrence),
 * hence the ';'-separated lists in multi-value assertions.
 */

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { buildOptionsQuery, OPTION_NAMES, parseOptions } from "../lib/routing";

const feature = await loadFeature("./options.feature");

// the atlas' own node kinds (data.json is the authority app.js validates against)
const ATLAS = (await import("../lib/routing")).D as {
	nodes: { kind: string }[];
};
const KINDS = [...new Set(ATLAS.nodes.map((n) => n.kind))];
// validation is list membership; these are the preset names the scenarios use
const LAYOUTS = ["grid", "elk-layered-wide", "cose-bilkent", "dagre", "circle"];

/** the whole option state, as app.js would hand it to buildOptionsQuery */
const WHOLE_STATE: Record<string, string> = {
	layout: "elk-layered-wide",
	force: "1",
	anim: "0",
	saved: "1",
	worker: "1",
	dens: "140",
	auto: "1",
	cats: "all",
	orphans: "1",
	links: "1",
	skilllinks: "0",
	regions: "0",
	possessions: "1",
	iso: "iron_sword",
	isodir: "up",
	isodepth: "all",
};

interface OptState {
	parsed: Map<string, string>;
	invalid: string[];
	built: string;
	names: string[];
	roundTripped: Map<string, string>;
}

let state: OptState;

function reset(): void {
	state = {
		parsed: new Map(),
		invalid: [],
		built: "",
		names: [],
		roundTripped: new Map(),
	};
}

/** parse a ';'-separated "name=value" list into a Map */
function pairs(list: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const part of list.split(";")) {
		const t = part.trim();
		if (!t) continue;
		const i = t.indexOf("=");
		out.set(
			i < 0 ? t : t.slice(0, i).trim(),
			i < 0 ? "" : t.slice(i + 1).trim(),
		);
	}
	return out;
}

describeFeature(feature, ({ Scenario, Background }) => {
	Background(({ Given }) => {
		Given(
			"the option helper is loaded with the atlas kinds and these layouts",
			async () => {
				reset();
				expect(KINDS).toContain("food");
			},
		);
	});

	/* ── booleans ────────────────────────────────────────────────────── */

	Scenario("A boolean option accepts the usual spellings", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			const r = parseOptions(search, { layouts: LAYOUTS, kinds: KINDS });
			state.parsed = r.values;
			state.invalid = r.invalid;
		});
		Then("the parsed options are {string}", async (_ctx, want: string) => {
			expect(state.parsed).toEqual(pairs(want));
		});
	});

	Scenario("A boolean option accepts the off-spellings", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			const r = parseOptions(search, { layouts: LAYOUTS, kinds: KINDS });
			state.parsed = r.values;
		});
		Then("the parsed options are {string}", async (_ctx, want: string) => {
			expect(state.parsed).toEqual(pairs(want));
		});
	});

	Scenario("A bare flag means on", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	Scenario(
		"Turned-off options are honoured rather than treated as absent",
		({ When, Then }) => {
			When("I parse the options {string}", async (_ctx, search: string) => {
				state.parsed = parseOptions(search, {
					layouts: LAYOUTS,
					kinds: KINDS,
				}).values;
			});
			Then("the parsed options are {string}", async (_ctx, want: string) => {
				expect(state.parsed).toEqual(pairs(want));
			});
		},
	);

	/* ── numbers ─────────────────────────────────────────────────────── */

	Scenario("A number option is clamped down to its range", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	Scenario(
		"A number option below its range is clamped up",
		({ When, Then }) => {
			When("I parse the options {string}", async (_ctx, search: string) => {
				state.parsed = parseOptions(search, {
					layouts: LAYOUTS,
					kinds: KINDS,
				}).values;
			});
			Then(
				"the parsed option {string} is {string}",
				async (_ctx, name: string, want: string) => {
					expect(state.parsed.get(name)).toBe(want);
				},
			);
		},
	);

	Scenario("A number option is rounded", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	/* ── unusable input ──────────────────────────────────────────────── */

	Scenario(
		"An unusable value is dropped and reported",
		({ When, Then, And }) => {
			When("I parse the options {string}", async (_ctx, search: string) => {
				const r = parseOptions(search, { layouts: LAYOUTS, kinds: KINDS });
				state.parsed = r.values;
				state.invalid = r.invalid;
			});
			Then("the parsed options are empty", async () => {
				expect(state.parsed.size).toBe(0);
			});
			And("the unusable options are {string}", async (_ctx, want: string) => {
				expect(state.invalid).toEqual(want.split(";").map((s) => s.trim()));
			});
		},
	);

	Scenario("Unknown option names are ignored", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	/* ── layout and kind lists ───────────────────────────────────────── */

	Scenario("A layout option must be a known preset", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	Scenario("The kinds option accepts a list", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then("the parsed options are {string}", async (_ctx, want: string) => {
			expect(state.parsed).toEqual(pairs(want));
		});
	});

	Scenario("The everything shorthand", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	Scenario("The nothing shorthand", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	Scenario("Unknown kinds are dropped from the list", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	/* ── isolation ───────────────────────────────────────────────────── */

	Scenario("The isolation direction is an enum", ({ When, Then, And }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			const r = parseOptions(search, { layouts: LAYOUTS, kinds: KINDS });
			state.parsed = r.values;
			state.invalid = r.invalid;
		});
		Then("the parsed options are empty", async () => {
			expect(state.parsed.size).toBe(0);
		});
		And("the unusable options are {string}", async (_ctx, want: string) => {
			expect(state.invalid).toEqual(want.split(";").map((s) => s.trim()));
		});
	});

	Scenario("The isolation depth takes a positive integer", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	Scenario(
		"An isolation depth of all means the whole tree",
		({ When, Then }) => {
			When("I parse the options {string}", async (_ctx, search: string) => {
				state.parsed = parseOptions(search, {
					layouts: LAYOUTS,
					kinds: KINDS,
				}).values;
			});
			Then(
				"the parsed option {string} is {string}",
				async (_ctx, name: string, want: string) => {
					expect(state.parsed.get(name)).toBe(want);
				},
			);
		},
	);

	Scenario("A zero isolation depth is rejected", ({ When, Then, And }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			const r = parseOptions(search, { layouts: LAYOUTS, kinds: KINDS });
			state.parsed = r.values;
			state.invalid = r.invalid;
		});
		Then("the parsed options are empty", async () => {
			expect(state.parsed.size).toBe(0);
		});
		And("the unusable options are {string}", async (_ctx, want: string) => {
			expect(state.invalid).toEqual(want.split(";").map((s) => s.trim()));
		});
	});

	Scenario("The isolation target is a snake_case slug", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then(
			"the parsed option {string} is {string}",
			async (_ctx, name: string, want: string) => {
				expect(state.parsed.get(name)).toBe(want);
			},
		);
	});

	Scenario("A malformed isolation target is rejected", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			const r = parseOptions(search, { layouts: LAYOUTS, kinds: KINDS });
			state.parsed = r.values;
			state.invalid = r.invalid;
		});
		Then("the unusable options are {string}", async (_ctx, want: string) => {
			expect(state.invalid).toEqual(want.split(";").map((s) => s.trim()));
		});
	});

	/* ── nothing given ───────────────────────────────────────────────── */

	Scenario("An empty query overrides nothing", ({ When, Then }) => {
		When("I parse the options {string}", async (_ctx, search: string) => {
			state.parsed = parseOptions(search, {
				layouts: LAYOUTS,
				kinds: KINDS,
			}).values;
		});
		Then("the parsed options are empty", async () => {
			expect(state.parsed.size).toBe(0);
		});
	});

	Scenario(
		"A query with only foreign params overrides nothing",
		({ When, Then }) => {
			When("I parse the options {string}", async (_ctx, search: string) => {
				state.parsed = parseOptions(search, {
					layouts: LAYOUTS,
					kinds: KINDS,
				}).values;
			});
			Then("the parsed options are empty", async () => {
				expect(state.parsed.size).toBe(0);
			});
		},
	);

	/* ── building the URL back out ───────────────────────────────────── */

	Scenario(
		"The built query describes the entire option state",
		({ When, Then }) => {
			When("I build the options query for the whole state", async () => {
				state.built = buildOptionsQuery(WHOLE_STATE);
			});
			Then("the built query contains {string}", async (_ctx, want: string) => {
				for (const part of want.split(";"))
					expect(state.built).toContain(part.trim());
			});
		},
	);

	Scenario("An option without a value is omitted", ({ When, Then }) => {
		When("I build the options query with no isolation", async () => {
			state.built = buildOptionsQuery({ ...WHOLE_STATE, iso: null });
		});
		Then(
			"the built query does not contain {string}",
			async (_ctx, want: string) => {
				expect(state.built).not.toContain(want);
			},
		);
	});

	Scenario(
		"The built query round-trips through the parser",
		({ When, Then }) => {
			When("I round-trip the whole option state", async () => {
				state.roundTripped = parseOptions(buildOptionsQuery(WHOLE_STATE), {
					layouts: LAYOUTS,
					kinds: KINDS,
				}).values;
			});
			Then("the round-tripped options match the original state", async () => {
				const original = new Map(Object.entries(WHOLE_STATE));
				expect(state.roundTripped).toEqual(original);
			});
		},
	);

	/* ── the option list itself ──────────────────────────────────────── */

	Scenario(
		"The option set covers layout, legend and isolation",
		({ When, Then, And }) => {
			When("I list the option names", async () => {
				state.names = OPTION_NAMES;
			});
			Then("the option names include {string}", async (_ctx, want: string) => {
				for (const name of want.split(";"))
					expect(state.names).toContain(name.trim());
			});
			And("there are {int} option names", async (_ctx, n: number) => {
				expect(state.names.length).toBe(n);
			});
		},
	);
});
