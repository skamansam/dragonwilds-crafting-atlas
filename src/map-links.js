/* ═══════════════════════════════════════════════════════════════
   LIVE MAP LINKS — "show me where this is found"

   The atlas knows WHICH region a gatherable comes from but not where inside it:
   data.json carries no coordinates for anything, so the map cannot draw a pin.
   The Wyrmwatch map (survivalservers.com) does have the pins — 25,298 of them,
   from the game's own files — so for the nodes whose name answers to one of its
   marker types the panel hands the reader over to it, pre-filtered.

   The link shape came out of that map's own wyrmwatch-map.js and was then
   confirmed in a browser, because guessing it wastes a reader's click:

     · It is a HASH, not a query string. readView() parses location.hash, so
       `?view=…` on the query string does nothing whatsoever.
     · `#view=<x>,<y>,<zoom>` takes the map's own world coordinates in metres
       (x ∈ [-12000, 408000], y ∈ [-118550, 301450]) and a zoom ≤ 7.
     · `#filters=<type keys>` is read INSIDE the view branch — a filter-only
       link (`#filters=iron`) silently shows the map's default filters instead.
       Every link built here therefore carries a view, even though this page has
       no coordinates of its own: the view is the fitted centre of that marker
       type's own nodes, computed at build time (scripts/build-map-links.mjs).
     · `#level=1` opens the underground plane; a surface link omits it, because
       anything other than `1` reads as the surface.
     · The map's own "copy view" button re-encodes a link built this way to the
       identical string, which is what proves the format rather than assumes it.

   Nothing here is fetched at runtime — the numbers come from the generated
   public/map-links.js artifact, so opening a panel costs no request to anyone.
   ═══════════════════════════════════════════════════════════════ */

/** The generated artifact (public/map-links.js), or null before it loads. */
const data = () => window.DW_MAP_LINKS || null;

/**
 * The fragment for one map view: `#view=x,y,zoom&level=1&filters=a,b`.
 *
 * @param {{view: {x: number, y: number, zoom: number}, keys: string[], plane?: number}} entry
 * @returns {string} the hash, leading `#` included
 */
export function mapHash(entry) {
	return (
		`#view=${entry.view.x},${entry.view.y},${entry.view.zoom}` +
		(entry.plane ? "&level=1" : "") +
		`&filters=${entry.keys.join(",")}`
	);
}

/**
 * The live-map link for an atlas node, or null when nothing answers to it.
 *
 * @param {string} nodeId
 * @returns {{href: string, keys: string[], labels: string[], count: number, plane: number}|null}
 */
export function mapLinkFor(nodeId) {
	const d = data();
	const entry = d?.nodes ? d.nodes[nodeId] : null;
	if (!entry || !entry.keys || !entry.keys.length) return null;
	const types = entry.keys.map((k) => d.types[k]).filter(Boolean);
	// an artifact that lost a type it references is a version skew, not a link
	// worth opening: the filter would silently drop the part it cannot name
	if (types.length !== entry.keys.length) return null;
	return {
		href: `${d.source.map}${mapHash(entry)}`,
		keys: entry.keys.slice(),
		labels: types.map((t) => t.label),
		count: types.reduce((n, t) => n + (t.count || 0), 0),
		plane: entry.plane ? 1 : 0,
	};
}

/**
 * One sentence describing what a link opens — shared by the panel button's
 * tooltip and the agent tool so the two can never describe it differently.
 *
 * @param {{labels: string[], count: number, plane: number}} link
 * @returns {string}
 */
export function mapLinkSummary(link) {
	if (!link) return "";
	const what = link.labels.join(" / ");
	const where = link.plane ? "underground" : "surface";
	const pins = link.count === 1 ? "1 marker" : `${link.count} markers`;
	return `${what} on the live Wyrmwatch map — ${pins} on the ${where}, pre-filtered`;
}

/* Published for the acceptance harness and the browser console. Guarded, unlike
   the other src/ mirrors: this module is also imported by
   tests/features/map-links.spec.ts, which runs under Node to drive the real
   formatter against the artifact, and a bare `window` would make that import
   throw before a single test ran. */
if (typeof window !== "undefined")
	window.DW_MAP_LINK_API = { mapHash, mapLinkFor, mapLinkSummary };
