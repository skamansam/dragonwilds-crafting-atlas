/* ═══════════════════════════════════════════════════════════════
   WEBMCP — the atlas as callable tools for browser agents

   https://developer.chrome.com/docs/ai/webmcp — an agent that lands on the
   atlas can either scrape the DOM and guess which button means "what do I need
   for an Iron Sword", or call a tool that says exactly that. These tools are
   the second option: real names, real JSON Schemas, real results.

   Progressive enhancement, per the spec's own guidance: `document.modelContext`
   only exists when the browser has the API (an origin trial, or
   chrome://flags/#enable-webmcp-testing locally). Without it this module builds
   the same tool set, publishes it on window.DW_WEBMCP for the test harness and
   the console, and registers nothing — the site behaves exactly as before.

   Only the IMPERATIVE API is used, deliberately: the declarative one turns an
   HTML <form> into a tool by annotating it (`toolname`/`tooldescription`), and
   the atlas has no form to annotate — its search box is an input with a live
   suggestion list, not a submit, so a hidden form would exist purely to be
   annotated. `atlas_search_items` covers that ground with a real schema.

   Every tool is a thin adapter over the app's own machinery (the panel's plan,
   the path BFS, the highlight walk, the legend rows) injected as a context by
   app.js — no second implementation of anything, so a tool can never disagree
   with what the map does when a human clicks the same button.

   Safety: the read tools are annotated readOnlyHint (they touch nothing), and
   the few that DO change the view or the ledger are annotated readOnlyHint
   false. Nothing here is irreversible, so nothing carries consequentialHint.
   ═══════════════════════════════════════════════════════════════ */

/**
 * One atlas node, as the tools return it.
 * @typedef {object} AtlasNode
 * @property {string} id
 * @property {string} name
 * @property {string} kind
 */

/**
 * What the tools are allowed to do to the app — every entry is a function the
 * app already had (a panel action, a legend row click, a BFS), handed over at
 * boot so this module holds no state of its own.
 * @typedef {object} WebMcpContext
 * @property {object} D the dataset (window.DW_DATA)
 * @property {Map<string, AtlasNode>} nodeById
 * @property {Map<string, Map<string, Set<string>>>} regionMembers region → item → gather methods
 * @property {Map<string, string[]>} regionQuests region → quest names
 * @property {Map<string, object>} questById
 * @property {Map<string, object>} mountById
 * @property {Map<string, Array<{region: string, method: string, tool: string}>>} foundIn
 * @property {string[]} regions the canonical Ashenfall region names
 * @property {string[]} kinds every node kind the atlas draws
 * @property {string[]} kindLabels human labels, parallel to `kinds`
 * @property {(query: string, limit: number) => AtlasNode[]} searchItems
 * @property {(id: string) => void} focusNode select + centre + open the codex
 * @property {(id: string, direction: string, depth: number|null) => void} isolateTree
 * @property {(id: string) => void} showRequires
 * @property {(id: string) => void} showEnables
 * @property {() => void} clearHighlight
 * @property {(id: string) => object|null} planOf
 * @property {(from: string, to: string) => Array<{from: string, to: string, qty: number|null, facility: string|null}>|null} routeBetween
 * @property {Set<string>} owned
 * @property {(id: string) => boolean} toggleOwned
 * @property {(kinds: string[]) => void} setKinds
 * @property {(layer: string, on: boolean) => void} setLinkLayer
 * @property {(on: boolean) => void} setDeadEnds
 * @property {() => object} viewState
 * @property {(id: string) => string} kindLabelOf
 */

let ctx = null;

// kinds that are map context rather than craftables — a quest has no recipe and
// saying "it is gathered or obtained directly" about one is just wrong
const META_KINDS = new Set(['region', 'quest', 'skill', 'spell', 'mount']);

/** Resolve a name or id the agent passed to a real node, or explain the miss. */
function resolveItem(ref) {
  const raw = String(ref == null ? '' : ref).trim();
  if (!raw) return { error: 'No item name given.' };
  if (ctx.nodeById.has(raw)) return { node: ctx.nodeById.get(raw) };
  const lower = raw.toLowerCase();
  for (const node of ctx.nodeById.values()) {
    if (node.name.toLowerCase() === lower) return { node };
  }
  const close = ctx.searchItems(raw, 5);
  return {
    error: `No atlas node named "${raw}".${close.length
      ? ` Closest matches: ${close.map(n => n.name).join(', ')}.`
      : ' Call atlas_search_items to look one up.'}`,
  };
}

const methods = (set) => [...(set || [])].join(' · ');

/* ── the tool set ───────────────────────────────────────────────────────── */

/** The tools, built against the injected context. */
function buildTools() {
  const readOnly = (extra = {}) => ({ readOnlyHint: true, untrustedContentHint: false, ...extra });

  return [
    {
      name: 'atlas_search_items',
      description: 'Search the Dragonwilds Crafting Atlas by name. Matches items, crafting stations, skills, tools, spells, regions and quests, and returns each hit\'s name and kind. Call atlas_get_item, atlas_get_plan or atlas_focus_item with a name this returns.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Part of a name, e.g. "iron" or "dark mage".' },
          limit: { type: 'number', description: 'Maximum number of hits (default 10, max 50).' },
        },
        required: ['query'],
      },
      annotations: readOnly(),
      execute: async ({ query, limit }) => {
        const hits = ctx.searchItems(String(query || ''), Math.min(Math.max(Number(limit) || 10, 1), 50));
        if (!hits.length) return `Nothing in the atlas matches "${query}".`;
        return `${hits.length} match${hits.length === 1 ? '' : 'es'} for "${query}":\n` +
          hits.map(n => `· ${n.name} (${ctx.kindLabelOf(n.id)}, id ${n.id})${ctx.owned.has(n.id) ? ' — marked owned' : ''}`).join('\n');
      },
    },
    {
      name: 'atlas_get_item',
      description: 'The full codex of one atlas node: kind, description, every recipe that makes it (inputs with quantities, station, skill level, XP), what it is used to make, where it is found (region, gather method, tool), and whether the user has marked it owned. Accepts a name or a node id.',
      inputSchema: {
        type: 'object',
        properties: { item: { type: 'string', description: 'Item, station, skill, region, quest or mount name (or node id).' } },
        required: ['item'],
      },
      annotations: readOnly(),
      execute: async ({ item }) => {
        const { node, error } = resolveItem(item);
        if (error) return error;
        const recipes = ctx.D.recipes.filter(r => r.output === node.id);
        const usedIn = ctx.D.edges.filter(e => e.from === node.id && !ctx.D.skills.some(s => s.name === e.from));
        const found = ctx.foundIn.get(node.id) || [];
        const quest = ctx.questById.get(node.id);
        const mount = ctx.mountById.get(node.id);
        const members = ctx.regionMembers.get(node.id);
        let out = `${node.name} — ${ctx.kindLabelOf(node.id)} (id ${node.id})${ctx.owned.has(node.id) ? ' · marked owned' : ''}\n`;
        if (node.description?.length) out += `Description: ${node.description.join(' ')}\n`;
        if (node.stats && Object.keys(node.stats).length) {
          out += `Stats: ${Object.entries(node.stats).map(([k, v]) => `${k} ${v}`).join(', ')}\n`;
        }
        for (const r of recipes) {
          // level and xp are optional in the dataset, so the gate is spelled out
          // rather than printing "Artisan undefined"
          const gate = r.skill
            ? ` (${[r.skill, r.level].filter(v => v != null && v !== '').join(' ')}${r.xp ? `, ${r.xp} xp` : ''})`
            : '';
          out += `Made at ${r.facility || r.blueprint || 'unknown station'}${gate}:\n`;
          out += `${r.inputs.map(input => `  · ${input.qty}× ${input.name}`).join('\n')}\n`;
        }
        if (!recipes.length && !META_KINDS.has(node.kind)) out += 'Not craftable — it is gathered or obtained directly.\n';
        if (usedIn.length) out += `Used to make: ${[...new Set(usedIn.map(e => e.to))].join(', ')}\n`;
        if (found.length) {
          out += `Found in:\n${found.map(f => `  · ${f.region} — ${f.method}${f.tool ? ` with a ${f.tool}` : ''}`).join('\n')}\n`;
        }
        if (members?.size) {
          out += `Holds ${members.size} gatherable item${members.size === 1 ? '' : 's'}: ` +
            [...members.entries()].slice(0, 40).map(([id, set]) => `${id} (${methods(set)})`).join(', ') + '\n';
        }
        const here = ctx.regionQuests.get(node.id) || [];
        if (here.length) out += `Quests here: ${here.join(', ')}\n`;
        if (quest) out += `Quest — where to start: ${quest.whereToStart || 'unknown'}\nRewards: ${(quest.rewards || []).map(r => r.item).join(', ') || 'none listed'}\n`;
        if (mount) out += `Mount (${mount.base}) — how to get it: ${mount.obtain || 'unknown'}${mount.quests?.length ? `\nRequires quest: ${mount.quests.join(', ')}` : ''}\n`;
        if (node.wiki) out += `Wiki page: ${node.wiki}\n`;
        return out;
      },
    },
    {
      name: 'atlas_get_plan',
      description: 'What it takes to make an item, from nothing: the gather list with quantities, the stations to build, the skill levels to train and the critical chain. Set from_owned to true to plan from the items already in the user\'s owned ledger.',
      inputSchema: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Item name or id.' },
          from_owned: { type: 'boolean', description: 'Plan from the owned ledger instead of from scratch.' },
        },
        required: ['item'],
      },
      annotations: readOnly(),
      execute: async ({ item, from_owned }) => {
        const { node, error } = resolveItem(item);
        if (error) return error;
        const plan = ctx.planOf(node.id);
        if (!plan) return `${node.name} is a raw item — there is nothing to craft. Use atlas_get_item to see where it is found.`;
        const ownedAnchor = from_owned ? `from the ${ctx.owned.size} item(s) marked owned` : 'from nothing';
        let out = `Plan for ${node.name} (${ownedAnchor})${plan.allOwned ? ' — nothing left to gather' : ''}:\n`;
        const sorted = [...plan.mats.entries()].sort((a, b) => b[1] - a[1]);
        out += sorted.length ? `Gather:\n${sorted.map(([m, q]) => `  · ${q}× ${m}`).join('\n')}\n` : 'Gather: nothing missing\n';
        if (plan.have?.size) out += `Already owned: ${[...plan.have.entries()].map(([m, q]) => `${q}× ${m}`).join(', ')}\n`;
        if (plan.stations.size) out += `Build: ${[...plan.stations].join(', ')}\n`;
        if (plan.skillLv.size) out += `Train: ${[...plan.skillLv.entries()].map(([s, lv]) => `${s} ${lv}`).join(', ')}\n`;
        if (plan.chain.length) out += `Critical chain (${plan.depth} steps): ${plan.chain.filter(Boolean).join(' → ')}\n`;
        return out;
      },
    },
    {
      name: 'atlas_find_path',
      description: 'The shortest material route between two atlas nodes, as ordered steps with quantities and stations. Use it to answer "how do I get from X to Y".',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Starting item name or id.' },
          to: { type: 'string', description: 'Target item name or id.' },
        },
        required: ['from', 'to'],
      },
      annotations: readOnly(),
      execute: async ({ from, to }) => {
        const a = resolveItem(from); const b = resolveItem(to);
        if (a.error) return a.error;
        if (b.error) return b.error;
        const steps = ctx.routeBetween(a.node.id, b.node.id);
        if (!steps || !steps.length) return `No crafting route between ${a.node.name} and ${b.node.name}.`;
        return `Route ${a.node.name} → ${b.node.name} (${steps.length} step${steps.length === 1 ? '' : 's'}):\n` +
          steps.map((s, i) => `${i + 1}. ${s.from} → ${s.to}${s.qty ? ` (${s.qty} needed)` : ''}${s.facility ? ` at ${s.facility}` : ''}`).join('\n');
      },
    },
    {
      name: 'atlas_get_region',
      description: 'Everything the atlas knows about one region or territory: the items found there with their gather methods, and the quests set in it.',
      inputSchema: {
        type: 'object',
        properties: { region: { type: 'string', description: 'Region or territory name, e.g. "Bleakfields Valley".' } },
        required: ['region'],
      },
      annotations: readOnly(),
      execute: async ({ region }) => {
        const { node, error } = resolveItem(region);
        if (error) return error;
        if (node.kind !== 'region') return `${node.name} is a ${ctx.kindLabelOf(node.id)}, not a region. Regions: ${ctx.regions.join(', ')}.`;
        const members = ctx.regionMembers.get(node.id) || new Map();
        const quests = ctx.regionQuests.get(node.id) || [];
        let out = `${node.name}:\n`;
        out += members.size
          ? `${members.size} thing${members.size === 1 ? '' : 's'} found here:\n` +
            [...members.entries()].map(([id, set]) => `  · ${id} (${methods(set)})`).join('\n') + '\n'
          : 'The wiki lists no resources for this place yet.\n';
        if (quests.length) out += `Quests here: ${quests.join(', ')}\n`;
        return out;
      },
    },
    {
      name: 'atlas_get_quest',
      description: 'One quest node: the region it is set in, where to start it, its reward items and the mounts it unlocks.',
      inputSchema: {
        type: 'object',
        properties: { quest: { type: 'string', description: 'Quest name.' } },
        required: ['quest'],
      },
      annotations: readOnly(),
      execute: async ({ quest }) => {
        const { node, error } = resolveItem(quest);
        if (error) return error;
        const q = ctx.questById.get(node.id);
        if (!q) return `${node.name} is a ${ctx.kindLabelOf(node.id)} — not a quest.`;
        let out = `${node.name}${q.type ? ` (${q.type}${q.tier ? ` · ${q.tier}` : ''})` : ''}\n`;
        if (q.regions?.length) out += `Set in: ${q.regions.join(', ')}\n`;
        out += `Where to start: ${q.whereToStart || 'not recorded'}\n`;
        out += (q.rewards || []).length
          ? `Rewards: ${q.rewards.map(r => `${r.item}${r.post ? ' (post-quest)' : r.during ? ' (during)' : ''}`).join(', ')}\n`
          : 'No reward items listed.\n';
        const mounts = [...ctx.mountById.entries()].filter(([, m]) => (m.quests || []).includes(node.id)).map(([id]) => id);
        if (mounts.length) out += `Unlocks mounts: ${mounts.join(', ')}\n`;
        return out;
      },
    },
    {
      name: 'atlas_get_owned',
      description: 'The user\'s owned ledger (their possessions in game): every item marked owned. Marking is what powers the "from what you own" plans and the reachable-only view.',
      inputSchema: { type: 'object', properties: {} },
      annotations: readOnly(),
      execute: async () => {
        const list = [...ctx.owned];
        if (!list.length) return 'Nothing is marked owned yet. Use atlas_set_owned to mark an item the user has.';
        return `${list.length} item${list.length === 1 ? '' : 's'} marked owned: ${list.join(', ')}`;
      },
    },
    {
      name: 'atlas_get_state',
      description: 'The current atlas view — what the user is looking at right now: the selected node, an isolated crafting tree (root, direction, depth), an active highlight, which kinds and link layers are shown, the layout algorithm, and how many nodes are drawn.',
      inputSchema: { type: 'object', properties: {} },
      annotations: readOnly(),
      execute: async () => {
        const s = ctx.viewState();
        let out = 'Current atlas view:\n';
        out += `Selected: ${s.selected || 'nothing'}\n`;
        out += `Isolated tree: ${s.isolated ? `${s.isolated.root} (${s.isolated.direction}${s.isolated.depth ? `, depth ${s.isolated.depth}` : ''})` : 'none'}\n`;
        out += `Highlight: ${s.highlight || 'none'}\n`;
        out += `Nodes drawn: ${s.visibleNodes} of ${s.totalNodes} (${s.hiddenKinds.length ? `hidden kinds: ${s.hiddenKinds.join(', ')}` : 'every kind shown'})\n`;
        out += `Link layers: ${Object.entries(s.linkLayers).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ')}\n`;
        out += `Dead ends: ${s.deadEnds ? 'shown' : 'hidden'} · Layout: ${s.layout}\n`;
        out += `Owned items: ${s.ownedCount}\n`;
        return out;
      },
    },
    {
      name: 'atlas_focus_item',
      description: 'Select a node in the atlas: opens its codex panel and centres the map on it. Use it whenever the conversation is about a specific item, so the user sees what the agent is talking about.',
      inputSchema: {
        type: 'object',
        properties: { item: { type: 'string', description: 'Item name or id.' } },
        required: ['item'],
      },
      annotations: readOnly({ readOnlyHint: false }), // it moves the user's view
      execute: async ({ item }) => {
        const { node, error } = resolveItem(item);
        if (error) return error;
        ctx.focusNode(node.id);
        return `Focused ${node.name} — its codex is open on the map.`;
      },
    },
    {
      name: 'atlas_isolate_tree',
      description: 'Collapse the map to one item\'s crafting tree. direction: "needs" (default) shows everything it takes to make it plus one step out, "up" only what it is made from, "down" only what it makes, "both" both ways. depth limits the walk in recipe steps (omit for the whole tree).',
      inputSchema: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Item name or id.' },
          direction: { type: 'string', enum: ['needs', 'up', 'down', 'both'], description: 'Which way to walk the tree.' },
          depth: { type: 'number', description: 'Recipe steps to walk (default: the whole tree where the direction allows it).' },
        },
        required: ['item'],
      },
      annotations: readOnly({ readOnlyHint: false }),
      execute: async ({ item, direction, depth }) => {
        const { node, error } = resolveItem(item);
        if (error) return error;
        const dir = ['needs', 'up', 'down', 'both'].includes(direction) ? direction : 'needs';
        const steps = Number.isFinite(Number(depth)) ? Math.max(1, Math.round(Number(depth))) : null;
        ctx.isolateTree(node.id, dir, steps);
        const s = ctx.viewState();
        return `Isolated the crafting tree of ${node.name} (${dir}${steps ? `, depth ${steps}` : ''}) — ${s.visibleNodes} nodes are now drawn.`;
      },
    },
    {
      name: 'atlas_highlight_links',
      description: 'Highlight links from one item, one level per call, without hiding the rest of the map: direction "requires" walks what it is made from, "enables" walks what it is used to make. Call it again to grow the highlight one level further. Pass reset true to clear it.',
      inputSchema: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Item name or id.' },
          direction: { type: 'string', enum: ['requires', 'enables'], description: 'Which links to highlight.' },
          reset: { type: 'boolean', description: 'Clear any existing highlight instead.' },
        },
        required: ['item'],
      },
      annotations: readOnly({ readOnlyHint: false }),
      execute: async ({ item, direction, reset }) => {
        const { node, error } = resolveItem(item);
        if (error) return error;
        if (reset) { ctx.clearHighlight(); return 'Highlight cleared — the whole map is back.'; }
        const dir = direction === 'enables' ? 'down' : 'up';
        (dir === 'down' ? ctx.showEnables : ctx.showRequires)(node.id);
        return `Highlighted the ${direction === 'enables' ? 'enables' : 'requires'} links of ${node.name}, one level further. Call again to expand, or reset true to clear.`;
      },
    },
    {
      name: 'atlas_set_owned',
      description: 'Add or remove an item in the user\'s owned ledger. Marking an item owned changes what the plans count as missing, so only mark what the user says they have.',
      inputSchema: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Item name or id.' },
          owned: { type: 'boolean', description: 'true marks it owned, false unmarks it.' },
        },
        required: ['item', 'owned'],
      },
      annotations: readOnly({ readOnlyHint: false }),
      execute: async ({ item, owned }) => {
        const { node, error } = resolveItem(item);
        if (error) return error;
        const has = ctx.owned.has(node.id);
        if (has !== !!owned) ctx.toggleOwned(node.id);
        return `${node.name} is now ${owned ? 'marked owned' : 'not marked owned'} (${ctx.owned.size} item${ctx.owned.size === 1 ? '' : 's'} in the ledger).`;
      },
    },
    {
      name: 'atlas_set_filters',
      description: 'Show or hide layers of the atlas: node kinds (items, stations, skills, tools, spells…), the link layers (recipe links, skill gates, region links, quest links) and dead-end nodes. Use it to strip the map down to what a question is about.',
      inputSchema: {
        type: 'object',
        properties: {
          kinds: { type: 'array', items: { type: 'string' }, description: 'The kinds to SHOW — anything not listed is hidden. Omit to leave the kind filter alone.' },
          links: {
            type: 'object',
            properties: {
              materials: { type: 'boolean', description: 'Recipe links.' },
              skills: { type: 'boolean', description: 'Skill-gate links.' },
              regions: { type: 'boolean', description: 'Region links.' },
              quests: { type: 'boolean', description: 'Quest and mount links.' },
            },
            description: 'Link layers to turn on or off. Omit to leave them alone.',
          },
          dead_ends: { type: 'boolean', description: 'Show nodes with no links.' },
        },
      },
      annotations: readOnly({ readOnlyHint: false }),
      execute: async ({ kinds, links, dead_ends }) => {
        const done = [];
        if (Array.isArray(kinds)) {
          const wanted = kinds.filter(k => ctx.kinds.includes(k));
          if (wanted.length !== kinds.length) done.push(`(ignored unknown kind${kinds.length - wanted.length === 1 ? '' : 's'}: ${kinds.filter(k => !ctx.kinds.includes(k)).join(', ')})`);
          ctx.setKinds(wanted);
          done.push(`showing kinds: ${wanted.length ? wanted.join(', ') : 'none'}`);
        }
        if (links && typeof links === 'object') {
          for (const layer of ['materials', 'skills', 'regions', 'quests']) {
            if (layer in links) { ctx.setLinkLayer(layer, !!links[layer]); done.push(`${layer} links ${links[layer] ? 'on' : 'off'}`); }
          }
        }
        if (typeof dead_ends === 'boolean') { ctx.setDeadEnds(dead_ends); done.push(`dead ends ${dead_ends ? 'shown' : 'hidden'}`); }
        return done.length ? `View updated — ${done.join('; ')}.` : 'Nothing to change: pass kinds, links or dead_ends.';
      },
    },
  ];
}

/**
 * Build the atlas' agent tools and register them with the browser, when the
 * browser has WebMCP at all. Always publishes the set on window.DW_WEBMCP.
 * @param {WebMcpContext} context capabilities injected by app.js
 * @returns {number} how many tools were registered (0 without the API)
 */
export function initWebMcp(context) {
  ctx = context;
  const tools = buildTools();
  const api = document.modelContext;
  const supported = !!(api && typeof api.registerTool === 'function');
  let registered = 0;
  if (supported) {
    for (const tool of tools) {
      // a rejected registration (bad schema, policy) must not take the boot down
      try {
        const result = api.registerTool(tool);
        if (result && typeof result.then === 'function') result.catch(e => console.warn('WebMCP tool rejected:', tool.name, e));
        registered++;
      } catch (e) {
        console.warn('WebMCP tool rejected:', tool.name, e);
      }
    }
    console.log(`WebMCP: registered ${registered} atlas tools`);
  }
  // the harness and the console reach the same tools either way
  window.DW_WEBMCP = {
    supported,
    names: tools.map(t => t.name),
    tools,
    /** Run one tool by name the way an agent would. */
    execute: (name, args) => {
      const tool = tools.find(t => t.name === name);
      if (!tool) throw new Error(`No WebMCP tool named ${name}`);
      return tool.execute(args || {});
    },
  };
  return registered;
}
