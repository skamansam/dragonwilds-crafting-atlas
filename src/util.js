/* ═══════════════════════════════════════════════════════════════
   Pure helpers — no DOM, no graph state, no globals.
   Split out of src/app.js (Phase 2) so the giant application file can
   keep its coupled UI/state code while the leaf utilities stay testable.
   ═══════════════════════════════════════════════════════════════ */

// HTML-escape a value for interpolation into innerHTML.
export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Human duration for the layout timer: 1234ms → "1.23s", 12345ms → "12.3s".
export function fmtLayoutDur(ms) {
  return (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + 's';
}

// "key: value" per line → object (the node editor's stats textarea).
export function parseStats(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (m?.[1]) out[m[1]] = m[2];
  }
  return out;
}

// Render one field value for the edits-window diff (P6-1b).
export function fmtEditVal(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.join(' · ');
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ');
  return String(v);
}

// Fuzzy match score for the search box: prefix > substring > subsequence.
// Returns -1 when the query does not match at all.
export function fuzzyScore(q, text) {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - t.length;
  const idx = t.indexOf(q);
  if (idx >= 0) return 700 - idx * 2 - t.length * 0.1;
  let ti = 0, score = 0, streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    if (found === ti) streak++; else streak = 0;
    score += streak * 3 - (found - ti) * 0.2;
    ti = found + 1;
  }
  return score;
}

// Wrap the matched slice of `text` in <mark> for the suggestion list.
export function highlight(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return esc(text);
  return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
}
