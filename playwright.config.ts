import { defineConfig, devices } from "@playwright/test";

// Playwright e2e tests for the Crafting Atlas.
// These mirror the permanent suite in scripts/test-ui.mjs but use Playwright's
// test runner for better developer ergonomics (fixtures, retries, trace viewer).
export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: false, // graph layouts are heavy; serialize to avoid contention
	timeout: 60000,
	expect: { timeout: 10000 },
	retries: 1,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		// baseURL lets tests use relative paths (page.goto("/")). The site is served
		// by the Vite dev server against the src/ sources (npm run dev, or the
		// webServer below on :8491), or by BASE_URL for a deployment.
		baseURL: process.env.BASE_URL || "http://localhost:8491",
		viewport: { width: 1600, height: 950 },
		// The app uses localStorage keys starting with "dw." — isolate per test
		actionTimeout: 30000,
		navigationTimeout: 60000,
		// Trace on first retry for debugging
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		// Only Chromium — the app uses Cytoscape which is browser-agnostic,
		// and the existing suite only runs Chromium.
	],
	// Boot the Vite dev server against the sources unless BASE_URL points at a
	// deployment. The dev base is "/", so the suite never has to know the Pages
	// sub-path the production build is served under.
	webServer: process.env.BASE_URL
		? undefined
		: {
				command: "npx vite --port 8491 --strictPort",
				url: "http://localhost:8491",
				timeout: 60000,
				reuseExistingServer: true,
		  },
});
