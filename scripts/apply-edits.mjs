// Applies a browser-exported edits file to the dataset (PLAN §3 P6-5).
//
//   node scripts/apply-edits.mjs <file.json> [--dry-run]
//
// Accepts either shape the app's ⚙ → Your data edits window exports:
//   • an edits overlay — { format: 'dragonwilds-edits', nodes: { id: {field: value} } }
//     (Export edits): merged field-by-field onto the matching nodes;
//   • a full dataset — { nodes: [ … ] } (Export full data): replaces the graph.
//
// The result is written to cache/final-dataset.json and re-emitted to
// site/data.json + site/data.js in the exact shape build-data.mjs and
// fetch-icon-files.mjs use, so the browser keeps reading the same files.
import fs from 'node:fs';
import { mergeEditsOverlay, validateDatasetExport, applyDatasetExport } from './apply-edits-core.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find(a => !a.startsWith('--'));
if (!file) {
  console.error('usage: node scripts/apply-edits.mjs <edits.json> [--dry-run]');
  process.exit(2);
}

const dataPath = new URL('../cache/final-dataset.json', import.meta.url).pathname;
const jsonPath = new URL('../site/data.json', import.meta.url).pathname;
const jsPath = new URL('../site/data.js', import.meta.url).pathname;

const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const input = JSON.parse(fs.readFileSync(file, 'utf8'));

if (input && Array.isArray(input.nodes)) {
  const v = validateDatasetExport(input);
  if (!v.ok) { console.error('invalid dataset export —', v.error); process.exit(2); }
  applyDatasetExport(dataset, input);
  if (v.dangling.length) console.error(`warning: ${v.dangling.length} edge(s) reference an unknown node id`);
  console.log(`full dataset: replaced ${input.nodes.length} node(s)`);
} else if (input?.nodes && typeof input.nodes === 'object') {
  const { changed, missed, linksAdded, missedLinks, addedCount, removedCount } = mergeEditsOverlay(dataset, input);
  const note = missed.length ? `, ${missed.length} unknown id(s) skipped` : '';
  const nodeNote = `${changed} node(s) updated${addedCount ? `, ${addedCount} added` : ''}${removedCount ? `, ${removedCount} removed` : ''}`;
  const linkNote = linksAdded || missedLinks.length ? `, ${linksAdded} link(s) added${missedLinks.length ? `, ${missedLinks.length} link(s) skipped` : ''}` : '';
  console.log(`edits overlay: ${nodeNote}${note}${linkNote}`);
  if (missed.length) console.log('  unknown ids:', missed.slice(0, 10).join(', ') + (missed.length > 10 ? ' …' : ''));
  if (missedLinks.length) console.log('  skipped links:', missedLinks.slice(0, 10).join(', ') + (missedLinks.length > 10 ? ' …' : ''));
} else {
  console.error('unrecognised file: expected a dragonwilds-edits or dataset JSON export');
  process.exit(2);
}

if (dryRun) { console.log('dry run — nothing written'); process.exit(0); }

fs.writeFileSync(dataPath, JSON.stringify(dataset, null, 1));
fs.writeFileSync(jsonPath, JSON.stringify(dataset, null, 1));
fs.writeFileSync(jsPath, 'window.DW_DATA = ' + JSON.stringify(dataset) + ';');
console.log('wrote cache/final-dataset.json + site/data.json + site/data.js');
