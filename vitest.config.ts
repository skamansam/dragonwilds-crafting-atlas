import { defineConfig } from "vitest/config";
import { VitestCucumberPlugin } from "@amiceli/vitest-cucumber/plugin";

// Vitest configuration for the Crafting Atlas.
// Two test layers:
//   - Unit tests (*.spec.ts) run in node environment for pure logic tests
//     (trace frontier math, persistence serialization, traceBack logic).
//   - Cucumber tests (.feature) use the @amiceli/vitest-cucumber plugin to
//     process Gherkin files. Step definitions live alongside spec files in tests/features/.
export default defineConfig({
	test: {
		// Root-level vitest workspace: tests live in /tests
		root: process.cwd(),
		globals: false,
		environment: "node",
		include: [
			"tests/unit/**/*.{spec,test}.{js,ts}",
			"tests/features/**/*.spec.ts",
		],
		plugins: [
			VitestCucumberPlugin({
				featureFilesDir: "tests/features",
			}),
		],
		hookTimeout: 30000,
		testTimeout: 30000,
	},
});
