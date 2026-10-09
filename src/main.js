/* ═══════════════════════════════════════════════════════════════
   DRAGONWILDS ✦ CRAFTING ATLAS — module entry

   index.html loads the vendor bundles (cytoscape + every layout extension +
   driver.js) and the generated data files as CLASSIC scripts from public/.
   Those run while the document is parsed, and module scripts are deferred, so
   by the time this file executes window.cytoscape, window.d3, window.driver,
   window.DW_DATA, window.DW_LAYOUTS, window.DW_CURATED, window.DW_FOUND_IN,
   window.DW_QUESTS and window.DW_MOUNTS all exist. All that is left to wire up
   is the stylesheet and the app.
   ═══════════════════════════════════════════════════════════════ */

import './style.css';
import './app.js';
