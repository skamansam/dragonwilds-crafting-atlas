#!/usr/bin/env node
// Audit the crafting graph (public/data.json) for craft-loop cycles.
//
// Edge direction: `from` = ingredient, `to` = product (e.g. Iron Ore -> Iron Bar).
// A cycle is therefore a chain of recipes where some product feeds back around as
// an ingredient of its own ancestry — either a genuine game mechanic (refining
// loops) or a data bug worth flagging.
//
// Method:
//   1. Tarjan's algorithm finds every strongly-connected component; any SCC with
//      more than one node (or a self-loop) is cyclic.
//   2. Within each cyclic SCC, every simple cycle is enumerated with a
//      canonical-start DFS (start only at the smallest node id; only visit nodes
//      <= start) so each cycle is reported exactly once.
//
// Usage: node scripts/audit-cycles.mjs [--json]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'site', 'data.json'), 'utf8'));

// ---- build adjacency (dedupe parallel recipe edges for cycle detection) ----
const adj = new Map();
for (const n of data.nodes) adj.set(n.id, []);
for (const e of data.edges) {
  if (e.deprecated) continue;
  if (!adj.has(e.from) || !adj.has(e.to)) continue; // dangling guard
  if (!adj.get(e.from).includes(e.to)) adj.get(e.from).push(e.to);
}

// ---- Tarjan SCC (iterative) ----
const index = new Map(), low = new Map(), onStack = new Set(), stack = [];
const sccs = [];
let counter = 0;
for (const start of adj.keys()) {
  if (index.has(start)) continue;
  const work = [[start, 0]];
  while (work.length) {
    const [v, pi] = work[work.length - 1];
    if (pi === 0) { index.set(v, counter); low.set(v, counter); counter++; stack.push(v); onStack.add(v); }
    let recursed = false;
    const outs = adj.get(v);
    for (let i = pi; i < outs.length; i++) {
      const w = outs[i];
      if (!index.has(w)) { work[work.length - 1][1] = i + 1; work.push([w, 0]); recursed = true; break; }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (recursed) continue;
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      sccs.push(comp);
    }
    work.pop();
    if (work.length) { const parent = work[work.length - 1][0]; low.set(parent, Math.min(low.get(parent), low.get(v))); }
  }
}

const cyclic = sccs.filter(c => c.length > 1);
cyclic.sort((a, b) => b.length - a.length);

// ---- edge lookup for reporting (from,to -> edge details) ----
const edgeInfo = new Map();
for (const e of data.edges) {
  if (e.deprecated) continue;
  const k = e.from + '→' + e.to;
  if (!edgeInfo.has(k)) edgeInfo.set(k, e);
}

// ---- simple-cycle enumeration per cyclic SCC ----
// Canonical form: DFS from each node s (ascending), visiting only nodes >= s;
// a cycle is reported when an edge returns to s. Every cycle is therefore found
// exactly once — anchored at its smallest node.
function simpleCycles(comp) {
  const members = new Set(comp);
  const order = [...comp].sort();
  const cycles = [];
  for (const start of order) {
    const path = [];
    const blocked = new Set();
    (function dfs(v) {
      path.push(v); blocked.add(v);
      for (const w of adj.get(v)) {
        if (!members.has(w) || w < start) continue;
        if (w === start) cycles.push([...path]);
        else if (!blocked.has(w)) dfs(w);
      }
      path.pop(); blocked.delete(v);
    })(start);
  }
  return cycles;
}

const fmtQty = e => e.qty != null ? `${e.qty}× ` : '';
const fmtEdge = e => `${fmtQty(e)}${e.from} → ${e.to}  [${e.facility ?? '—'}${e.skill ? `, ${e.skill}` : ''}]`;
const fmtChain = cyc => cyc.map(n => n).join(' → ') + ' → ' + cyc[0];

// ---- report ----
const jsonOut = [];
let total = 0;
for (const comp of cyclic) {
  const cycles = simpleCycles(comp);
  total += cycles.length;
  const outside = [];
  for (const cyc of cycles) {
    const steps = [];
    for (let i = 0; i < cyc.length; i++) {
      const a = cyc[i], b = cyc[(i + 1) % cyc.length];
      steps.push(edgeInfo.get(a + '→' + b));
    }
    jsonOut.push({ nodes: cyc, edges: steps });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ sccCount: sccs.length, cyclicSccs: cyclic.map(c => c.sort()), cycleCount: total, cycles: jsonOut }, null, 2));
  process.exit(0);
}

console.log(`dragonwilds crafting graph — cycle audit`);
console.log(`nodes: ${data.nodes.length}  edges (incl. parallel): ${data.edges.length}  SCCs: ${sccs.length}  cyclic SCCs: ${cyclic.length}\n`);

if (!cyclic.length) { console.log('No cycles found — the crafting graph is a DAG.'); process.exit(0); }

for (const comp of cyclic) {
  comp.sort();
  const cycles = simpleCycles(comp);
  console.log('═'.repeat(72));
  console.log(`SCC (${comp.length} nodes, ${cycles.length} cycle${cycles.length === 1 ? '' : 's'}): ${comp.join(', ')}`);
  for (const cyc of cycles) {
    console.log(`\n  cycle: ${fmtChain(cyc)}`);
    for (let i = 0; i < cyc.length; i++) {
      const a = cyc[i], b = cyc[(i + 1) % cyc.length];
      console.log(`    step ${i + 1}: ${fmtEdge(edgeInfo.get(a + '→' + b))}`);
    }
  }
  console.log();
}
console.log('─'.repeat(72));
console.log(`total: ${total} simple cycle${total === 1 ? '' : 's'} across ${cyclic.length} cyclic SCC${cyclic.length === 1 ? '' : 's'}`);
