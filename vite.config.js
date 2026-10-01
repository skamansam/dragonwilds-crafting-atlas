import { defineConfig } from "vite";

// Vite dev server for the Crafting Atlas.
// The site is a static, classic-script app (no build step): index.html loads
// vendor Cytoscape extensions + data.js + app.js via <script> tags. Vite
// serves those files as static assets — classic scripts are passed through
// untransformed, only ESM <script type="module"> would get transformed.
export default defineConfig({
	root: "site",
	publicDir: "site",
	server: {
		port: 5173,
		strictPort: true,
		open: false,
	},
	appType: "static",
	// No build transformation needed — the production site is raw static HTML.
	// `vite build` here just copies the static files for a preview server.
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			// Preserve the multi-entry script-tag architecture
			input: "site/index.html",
		},
	},
});
