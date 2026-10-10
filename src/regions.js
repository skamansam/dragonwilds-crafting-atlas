/* ═══════════════════════════════════════════════════════════════
   Canonical Ashenfall regions — the single source of truth.

   This list lived as three hand-copied constants (src/app.js,
   scripts/build-exports.mjs, scripts/build-found-in.mjs) and drifted:
   build-found-in.mjs was left with an early 7-region list while the app and
   the exporter had 34, so every region added later — Stormtouched Highlands,
   Fellhollow, Umbral Sands, Dowdun Reach … — was invisible to the found-in
   parser and its items came out with "method known, no region named".

   Order matters: it is the display order for region hubs and the order the
   hand-annotation checklists follow (the dragonwilds wiki location page).

   Not every region is a good "found-in" value — the first block is the
   playable divisions, the last two are quest-only names the Quests page uses
   and location prose never does.
   ═══════════════════════════════════════════════════════════════ */
export const CANON_REGIONS = [
	// other divisions (never found-in values, kept out): the north, the far north,
	// the mountainous reach, the far south-east
	"Temple Woods",
	"Bramblemead Valley",
	"Whispering Swamp",
	"Ghornfell",
	"Fractured Plains",
	"Bloodblight Swamp",
	"Stormtouched Highlands",
	"Fellhollow",
	"Bleakfields Valley",
	"Forgotten Temple",
	"Dragon's Run",
	"Emberwood",
	"Witchwillow Range",
	"Hope's Fall",
	"Lake of Lost Souls",
	"Silverthorn Keep",
	"Coalridge Pass",
	"Dowdun Reach",
	"The Approach",
	"The Courtyard",
	"The Nexus",
	"The Library",
	"The Grand Hall",
	"The Garrison",
	"The Pastures",
	"The Menagerie",
	"The Bastion",
	"Umbral Sands",
	"Alcarrid Oasis",
	"Dunes of Uzzer",
	"Manafem Plains",
	"The Burning Spire",
	// quest-only regions (P7): named by the Quests page, never by location prose
	"Brynmoor",
	"Scorned Wilderness",
];

/** Escape a region name for safe use inside a RegExp. */
export const regionRe = (flags = "g") =>
	new RegExp(
		"\\b(" +
			CANON_REGIONS.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(
				"|",
			) +
			")\\b",
		flags,
	);
