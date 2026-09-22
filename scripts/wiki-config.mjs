// Shared etiquette config for every wiki-facing script (TICKET-08 in TODO-compliance.md).
// Be polite to the wiki: default to ~1 request/second, identify ourselves with a
// descriptive User-Agent, and never burst-fetch. Override the rate with RATE_MS env
// (milliseconds between requests), e.g. `RATE_MS=250 node scripts/fetch-wiki.mjs`.
export const REPO_URL = 'https://github.com/skamansam/dragonwilds-crafting-atlas';
export const USER_AGENT =
  `DragonwildsCraftingExplorer/1.0 (+${REPO_URL}; non-commercial offline crafting reference; contact via repo issues)`;
export const RATE_MS = Math.max(0, parseInt(process.env.RATE_MS ?? '1000', 10));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
