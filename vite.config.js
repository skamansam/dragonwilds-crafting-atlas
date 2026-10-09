import { defineConfig } from "vite";

/* Deploy base path. GitHub Pages serves this repo as a PROJECT site on the
   custom domain — https://rudeboy.dev/dragonwilds-crafting-atlas/ — so every
   built asset URL has to carry that prefix. CI passes the authoritative value
   straight from actions/configure-pages (its `base_path` output), which also
   makes a rename or a move to a user page a no-op; the default below matches it
   for a plain local `npm run build`.

   `npm run dev` deliberately serves from "/" instead: the acceptance harness
   and the Playwright suite talk to http://localhost:8491/ and should not have
   to know the deploy path. */
const PAGES_BASE = process.env.PAGES_BASE || "/dragonwilds-crafting-atlas/";
// normalize to exactly one leading and trailing slash ("" → "/")
const withSlashes = p => `/${String(p).replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");

export default defineConfig(({ command }) => ({
  base: command === "build" ? withSlashes(PAGES_BASE) : "/",

  // public/ is copied verbatim into the build: vendor bundles, icons, fonts,
  // the generated data files and the layout Web Worker. None of it is
  // transformed or bundled.
  publicDir: "public",

  // The atlas is hash-routed (see src/routing.js) and index.html is the single
  // entry, so this must be "spa". ("static" is not a valid Vite appType, which
  // is why the dev server used to 404 on / and /index.html.)
  appType: "spa",

  server: {
    port: 5173,
    strictPort: true,
    open: false,
  },

  preview: {
    port: 4173,
    strictPort: true,
  },

  build: {
    // Resolved against the project root, so this is <repo>/dist — the folder the
    // Pages workflow uploads. A default of "dist" with root === publicDir used
    // to nest the output inside the input and emit nothing.
    outDir: "dist",
    emptyOutDir: true,
  },
}));
