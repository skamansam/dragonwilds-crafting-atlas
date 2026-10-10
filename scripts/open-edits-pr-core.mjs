/* Pure logic for turning an exported dragonwilds-edits.json into a pull request
   (scripts/open-edits-pr.mjs). No fs, no git, no child_process — the CLI does
   the I/O and the branch/commit/push/PR steps, and this module decides what the
   change *is* and how to describe it, so both are unit-testable.

   The merge itself lives in apply-edits-core.mjs and is shared with
   apply-edits.mjs; nothing here duplicates it. */
import { EDIT_FIELDS, LINK_RELS } from './apply-edits-core.mjs';

// one value as a PR/commit line — mirrors fmtEditVal() in src/util.js
export function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(' · ') : '—';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ') || '—';
  return String(v);
}

/* What the overlay would change, read off the *pre-merge* dataset: the merge in
   apply-edits-core.mjs mutates in place, so the "before" values have to be
   captured here. Anything it would skip is reported, not silently dropped. */
export function summarizeOverlay(dataset, edits) {
  const nodes = Array.isArray(dataset?.nodes) ? dataset.nodes : [];
  const byId = new Map(nodes.map(n => [n.id, n]));

  const changed = [];
  for (const [id, patch] of Object.entries(edits?.nodes || {})) {
    const n = byId.get(id);
    if (!n || !patch) continue;
    const fields = [];
    for (const f of EDIT_FIELDS) {
      if (patch[f] === undefined) continue;
      if (JSON.stringify(n[f] ?? null) === JSON.stringify(patch[f] ?? null)) continue;
      fields.push({ field: f, from: n[f] ?? null, to: patch[f] ?? null });
    }
    if (fields.length) changed.push({ id, fields });
  }

  const added = Object.entries(edits?.added || {})
    .filter(([id]) => id && !byId.has(id))
    .map(([id, spec]) => ({ id, kind: spec?.kind || 'other' }));

  const removed = (Array.isArray(edits?.removed) ? edits.removed : []).filter(id => byId.has(id));

  const links = (edits?.links || []).filter(l => l?.from && l?.to && LINK_RELS.includes(l?.rel));

  return { changed, added, removed, links };
}

/* The same thing for a full-dataset export, which has no overlay to read: diff
   the export against the dataset it is about to replace. */
export function summarizeDataset(dataset, exported) {
  const before = new Map((dataset?.nodes || []).map(n => [n.id, n]));
  const after = exported.nodes || [];
  const afterIds = new Set(after.map(n => n.id));
  const changed = [];
  for (const n of after) {
    const b = before.get(n.id);
    if (!b) continue;
    const fields = [];
    for (const f of EDIT_FIELDS) {
      if (JSON.stringify(b[f] ?? null) === JSON.stringify(n[f] ?? null)) continue;
      fields.push({ field: f, from: b[f] ?? null, to: n[f] ?? null });
    }
    if (fields.length) changed.push({ id: n.id, fields });
  }
  return {
    changed,
    added: after.filter(n => !before.has(n.id)).map(n => ({ id: n.id, kind: n.kind })),
    removed: [...before.keys()].filter(id => !afterIds.has(id)),
    links: [],
  };
}

export const changeCount = (s) =>
  s.changed.length + s.added.length + s.removed.length + s.links.length;

// true when the graph itself moves (not just field values) — the desktop
// exports and the cycle audit only need re-running then
export const graphChanged = (s) => s.added.length + s.removed.length + s.links.length > 0;

/* One line per change, in the order a reviewer reads them: renamed/retyped
   fields, then added, removed and linked nodes. */
export function changeLines(summary) {
  const out = [];
  for (const c of summary.changed) {
    for (const f of c.fields) out.push(`\`${c.id}\`: ${f.field} \`${fmtVal(f.from)}\` → \`${fmtVal(f.to)}\``);
  }
  for (const a of summary.added) out.push(`added \`${a.id}\` (kind \`${a.kind}\`)`);
  for (const id of summary.removed) out.push(`hid \`${id}\` (and its edges)`);
  for (const l of summary.links) out.push(`link: \`${l.from}\` ${l.rel} \`${l.to}\``);
  return out;
}

export function slugify(text, max = 48) {
  const s = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return s || 'edits';
}

// data/fix-iron-bar-item-type — from an explicit --title, else from the change
export function branchName(summary, title) {
  const from = title || (summary.changed[0] && `${summary.changed[0].id} ${summary.changed[0].fields[0].field}`)
    || (summary.added[0] && `add ${summary.added[0].id}`)
    || (summary.links[0] && `link ${summary.links[0].from} ${summary.links[0].rel} ${summary.links[0].to}`)
    || "dataset edits";
  return `data/${slugify(from)}`;
}

/* "Fix Iron Bar's item type" is a human's job; this is the honest mechanical one
   for --title-less runs. */
export function defaultTitle(summary) {
  if (changeCount(summary) === 1) {
    const c = summary.changed[0];
    if (c) return `Data edit: ${c.id}`;
    if (summary.added[0]) return `Data edit: add ${summary.added[0].id}`;
    if (summary.removed[0]) return `Data edit: hide ${summary.removed[0]}`;
    const l = summary.links[0];
    if (l) return `Data edit: ${l.from} ${l.rel} ${l.to}`;
  }
  const parts = [];
  if (summary.changed.length) parts.push(`${summary.changed.length} node(s) updated`);
  if (summary.added.length) parts.push(`${summary.added.length} added`);
  if (summary.removed.length) parts.push(`${summary.removed.length} hidden`);
  if (summary.links.length) parts.push(`${summary.links.length} link(s)`);
  return parts.length ? `Data edits: ${parts.join(", ")}` : "Data edits";
}

export function commitMessage(summary, { title, trailer } = {}) {
  const subject = title || defaultTitle(summary);
  const lines = changeLines(summary);
  const body = [
    lines.length === 1 ? `- ${lines[0]}` : lines.map(l => `- ${l}`).join('\n'),
    '',
    'Edited in the atlas (✎ → Your data edits → ⤓ Export edits); merged with',
    'scripts/open-edits-pr.mjs.',
  ].join('\n');
  return { subject, body, full: trailer ? `${subject}\n\n${body}\n\n${trailer}` : `${subject}\n\n${body}` };
}

/* The PR body: what changed, why, how it was produced, and the checks a data PR
   is reviewed on (CONTRIBUTOR-DATA.md §13). `checks` are reported as the run
   found them — never pre-ticked. */
export function prBody({ summary, base, baseGeneratedAt, currentGeneratedAt, files = [], checks = {} }) {
  const lines = changeLines(summary);
  const baseNote = !baseGeneratedAt
    ? '_The export carries no `baseGeneratedAt` (a full-dataset export or an older file).'
    : baseGeneratedAt === currentGeneratedAt
      ? `\`baseGeneratedAt\`: \`${baseGeneratedAt}\` — matches \`public/data.json\` when the edits were exported.`
      : `\`baseGeneratedAt\`: \`${baseGeneratedAt}\` — **the dataset has moved on** (\`${currentGeneratedAt}\`); the rows below were re-checked after the merge.`;

  const md = [
    "## What changed",
    ...(lines.length ? lines.map(l => `- ${l}`) : ["- (no changes)"]),
    "",
    "## Why",
    "…(say what you checked: in game, or the wiki page that says so)",
    "",
    "## How",
    "- edited in the atlas (`✎` → edit form → Links), exported with ⤓ Export edits",
    `- \`node scripts/open-edits-pr.mjs dragonwilds-edits.json\` (${summary.changed.length} node(s) updated, ${summary.added.length} added, ${summary.removed.length} hidden, ${summary.links.length} link(s) added)`,
    `- files: ${files.length ? files.map(f => `\`${f}\``).join(", ") : "(none listed)"}`,
    "",
    "## Base",
    baseNote.trim(),
    "",
    "## Checks",
    `- [${checks.vitest ? "x" : " "}] \`npx vitest run\``,
    `- [${checks.exports ? "x" : " "}] desktop exports regenerated${checks.exports ? "" : " (not needed — no node or edge changes)"}`,
    "- [ ] no `dragonwilds-edits.json` in the diff (the export is the input, not the change)",
    "",
    `Base branch: \`${base}\`.`,
  ];
  return md.join("\n");
}
