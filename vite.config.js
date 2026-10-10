import fs from "node:fs";
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

/* ── build stamp (newer-version notice) ────────────────────────
   A tab left open keeps the JS/CSS hashes it loaded and so misses every later
   deploy. src/version.js polls a tiny version.json for this id and shows a
   bottom banner when it differs from the id stamped into the page. Both come
   from here, so a dev server and a real build are self-consistent — a page is
   never "stale" against its own stamp, only against a later deploy's. */
const BUILD_ID = (process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 12) : "local") +
  "-" + (process.env.GITHUB_RUN_ATTEMPT || "0") + "-" + Date.now().toString(36);

function versionStamp() {
  const payload = `${JSON.stringify({ id: BUILD_ID })}\n`;
  return {
    name: "dw-version-stamp",
    // stamp the id into the served page so it can identify itself offline
    transformIndexHtml: () => [
      { tag: "meta", attrs: { name: "dw-build", content: BUILD_ID }, injectTo: "head" },
    ],
    // dev: there is no emitted file, so answer the poll directly
    configureServer: (server) => {
      server.middlewares.use((req, res, next) => {
        if ((req.url || "").split("?")[0] !== "/version.json") return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(payload);
      });
    },
    // build: emit the polled file beside index.html (base-prefixed at runtime)
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: payload });
    },
  };
}

/* ── contributor guides on the site ────────────────────────────
   CONTRIBUTOR.md and CONTRIBUTOR-DATA.md live at the repo root, where GitHub is
   the only thing that renders them. The app's data-editing UI links to the guide
   (⚙ → Your data edits, and the ? help), so the deployed site needs a URL for it:
   this plugin answers both files in dev and emits them beside index.html in a
   build. public/ is copied verbatim and holds generated data, so the guides stay
   at the root as the single source — nothing is duplicated, nothing can drift. */
const CONTRIBUTOR_GUIDES = ["CONTRIBUTOR.md", "CONTRIBUTOR-DATA.md"];
const guideSource = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

function contributorGuides() {
  return {
    name: "dw-contributor-guides",
    // dev: there is no emitted file, so serve the root markdown directly
    configureServer: (server) => {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || "").split("?")[0];
        const name = CONTRIBUTOR_GUIDES.find(f => path === `/${f}`);
        if (!name) return next();
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(guideSource(name));
      });
    },
    // build: emit each guide beside index.html (index.html links them relatively,
    // so the deploy base path needs no special casing)
    generateBundle() {
      for (const name of CONTRIBUTOR_GUIDES) {
        this.emitFile({ type: "asset", fileName: name, source: guideSource(name) });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? withSlashes(PAGES_BASE) : "/",
  plugins: [versionStamp(), contributorGuides()],

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
