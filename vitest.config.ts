import { defineConfig } from "vitest/config";
import { VitestCucumberPlugin } from "@amiceli/vitest-cucumber/plugin";

// Vitest configuration for the Crafting Atlas.
// One test layer: Cucumber tests. Every scenario is Gherkin (.feature) and the
// step definitions live alongside it in tests/features/*.spec.ts, driving the
// shared pure helpers in tests/lib/trace-math.ts. (The former tests/unit/*
// duplicates were folded into Gherkin so the logic has a single home.)
export default defineConfig({
	test: {
		// Root-level vitest workspace: tests live in /tests
		root: process.cwd(),
		globals: false,
		environment: "node",
		include: ["tests/features/**/*.spec.ts"],
		plugins: [
			VitestCucumberPlugin({
				featureFilesDir: "tests/features",
			}),
		],
		hookTimeout: 30000,
		testTimeout: 30000,
	},
});
