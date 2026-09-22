// Audits wiki attribution coverage (TICKET-06): every node carrying wiki-derived
// data should deep-link to its source article. Nodes without a page (implicit
// recipe variants, decoration outputs) are listed as expected exceptions.
import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync(new URL('../cache/final-dataset.json', import.meta.url).pathname, 'utf8'));

const byKind = {};
const missing = [];
for (const n of d.nodes) {
  byKind[n.kind] = byKind[n.kind] || { total: 0, linked: 0 };
  byKind[n.kind].total++;
  if (n.wiki) byKind[n.kind].linked++;
  else missing.push(n);
}

console.log('Wiki deep-link coverage by node kind:');
let total = 0, linked = 0;
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].total - a[1].total)) {
  total += v.total; linked += v.linked;
  console.log(`  ${k.padEnd(10)} ${String(v.linked).padStart(5)}/${v.total}`);
}
console.log(`  ${'TOTAL'.padEnd(10)} ${String(linked).padStart(5)}/${total}  (${(100 * linked / total).toFixed(1)}%)`);

// unlinked nodes: split into "has a real wiki page we failed to link" vs
// "implicit/decoration nodes that never had a page"
const implicit = missing.filter(n => n.kind === 'implicit');
const others = missing.filter(n => n.kind !== 'implicit');
console.log(`\nUnlinked nodes: ${missing.length} (implicit/variant: ${implicit.length}, other: ${others.length})`);
if (others.length) {
  console.log('\nNon-implicit nodes missing wiki links (should be fixed or explained):');
  for (const n of others.slice(0, 30)) console.log(`  - [${n.kind}] ${n.name}`);
  if (others.length > 30) console.log(`  … and ${others.length - 30} more`);
}

// referenced-but-ghost nodes: outputs/inputs that don't exist as nodes at all
const nodeNames = new Set(d.nodes.map(n => n.name));
const ghostOut = new Set(), ghostIn = new Set();
for (const r of d.recipes) {
  if (!nodeNames.has(r.output)) ghostOut.add(r.output);
  for (const i of r.inputs) if (!nodeNames.has(i.name)) ghostIn.add(i.name);
}
console.log(`\nGhost references (no node, only edges): outputs ${ghostOut.size}, inputs ${ghostIn.size}`);
console.log('  (these are decoration variants / pageless items — documented in COMPLIANCE.md)');

// exit code: fail if any real (non-implicit) node lacks a link
process.exit(others.length ? 1 : 0);
