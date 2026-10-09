/* ═══════════════════════════════════════════════════════════════
   MINIMAP
   Split out of src/app.js (Phase 2). Draws the visible-node overview and the
   viewport rectangle on a 2D canvas, and recentres the graph on click.
   app.js injects the graph handle (cy) and the node→colour function.
   ═══════════════════════════════════════════════════════════════ */

export function initMinimap({ cy, nodeColor }) {
  const minimap = document.getElementById('minimap');
  minimap.hidden = false;
  const mmCanvas = document.getElementById('mmCanvas');
  const mmViewport = document.getElementById('mmViewport');
  const mmCtx = mmCanvas.getContext('2d');
  let mmDirty = true;

  function mmResize() {
    const r = minimap.getBoundingClientRect();
    mmCanvas.width = r.width * devicePixelRatio;
    mmCanvas.height = r.height * devicePixelRatio;
    mmDirty = true;
  }
  window.addEventListener('resize', mmResize);
  mmResize();

  function drawMinimap() {
    if (mmDirty) {
      mmCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      mmCtx.clearRect(0, 0, mmCanvas.width, mmCanvas.height);
      const w = mmCanvas.width / devicePixelRatio, h = mmCanvas.height / devicePixelRatio;
      const bb = cy.nodes(':visible').boundingBox({});
      if (bb && bb.w > 0) {
        const scale = Math.min((w - 8) / bb.w, (h - 8) / bb.h);
        const ox = (w - bb.w * scale) / 2 - bb.x1 * scale;
        const oy = (h - bb.h * scale) / 2 - bb.y1 * scale;
        for (const n of cy.nodes(':visible')) {
          const p = n.position();
          mmCtx.fillStyle = n.hasClass('locked') ? '#333' : nodeColor(n.data('meta'));
          mmCtx.globalAlpha = n.hasClass('locked') ? 0.25 : 0.75;
          mmCtx.fillRect(ox + p.x * scale - 1, oy + p.y * scale - 1, 2.2, 2.2);
        }
        mmCtx.globalAlpha = 1;
        const extent = cy.extent();
        mmViewport.style.left = (ox + extent.x1 * scale) + 'px';
        mmViewport.style.top = (oy + extent.y1 * scale) + 'px';
        mmViewport.style.width = (extent.w * scale) + 'px';
        mmViewport.style.height = (extent.h * scale) + 'px';
      }
      mmDirty = false;
    }
  }

  cy.on('position resize add remove', () => { mmDirty = true; });
  cy.on('viewport', () => { mmDirty = true; });
  (function mmLoop() { drawMinimap(); requestAnimationFrame(mmLoop); })();
  minimap.onclick = (e) => {
    const rect = minimap.getBoundingClientRect();
    const bb = cy.nodes(':visible').boundingBox({});
    if (!bb || bb.w <= 0) return;
    const w = rect.width, h = rect.height;
    const scale = Math.min((w - 8) / bb.w, (h - 8) / bb.h);
    const ox = (w - bb.w * scale) / 2 - bb.x1 * scale;
    const oy = (h - bb.h * scale) / 2 - bb.y1 * scale;
    const wx = (e.clientX - rect.left - ox) / scale;
    const wy = (e.clientY - rect.top - oy) / scale;
    cy.animate({ center: { x: wx, y: wy } }, { duration: 300 });
  };
}
