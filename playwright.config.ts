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
		// either from the Vite dev server (npm run dev), the in-process server
		// (scripts/test-ui.mjs --serve-only on :8491), or BASE_URL for a deployment.
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
	// Serve the site from an in-process server if BASE_URL isn't set
	webServer: process.env.BASE_URL
		? undefined
		: {
				command: "node scripts/test-ui.mjs --serve-only 2>/dev/null || npx vite preview --port 8491",
				url: "http://localhost:8491",
				timeout: 30000,
				reuseExistingServer: true,
		  },
});
