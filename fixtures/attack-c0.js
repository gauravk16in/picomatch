'use strict';

/**
 * REVIEW ATTACK — C0 differential harness (review tooling, not port code).
 * Generates adversarial cases aimed at the C0 surface ONLY, projects both
 * sides, and compares per the corpus policy:
 *   - errors: class + message BYTES (always comparable)
 *   - ok: state.input (UTF-16 units), state.prefix, state.dot (always)
 *   - fastpath-route ok rows (loop-free in the original): also index, start,
 *     consumed length, counters, flags, tokens — everything EXCEPT output
 *     (output is C1-owned: inline fastpath anchors, moved per amended C0 DoD)
 *   - loop-route ok rows: loop-dependent fields are STAGED, not failures
 *
 * node fixtures/attack-c0.js [n]
 */

const { execFileSync } = require('child_process');
const path = require('path');
const N = Number(process.argv[2] || 220);

const emoji = '\u{1F600}'; // 2 UTF-16 units
const cases = [];
const add = (pattern, options) => cases.push({ i: cases.length, pattern, options: options || {} });

// --- category: empties / prefixes ---
['', './', '././', './.', '.', '..', '/', '//', '///', './a', 'a', 'abc', 'a.b', 'a/b', 'a//b', 'x'].forEach(p => add(p));

// --- category: literals incl. regex-y single chars (no loop constructs) ---
['^', '$', '^$', 'a$b^c', ' ', '  ', '©', 'ñ', 'a^b', 'a$b', '.hidden', '...x', 'a..b', '-', '_', '~', '#', '%', '&', ';', ':', '=', '0', '1', '9'].forEach(p => add(p));

// --- category: REPLACEMENTS exact keys + near misses ---
['***', '**/**', '**/**/**', '****', '**/**/**/**', '***x', 'a***', '**', '**/', '**/*'].forEach(p => add(p));

// --- category: NUL + control ---
['a\u0000b', '\u0000', '\u0000***', 'a\u0007b', '\t', 'a\tb', '\n', '\r', 'x\u0000y\u0000z'].forEach(p => add(p));

// --- category: backslashes (incl. malicious.js-style run) ---
['\\', '\\\\', 'a\\', '\\a', 'a\\b', '\\\\\\', '\\.', '\\/', 'a/\\b', '\\'.repeat(64), '\\'.repeat(65500)].forEach(p => add(p));

// --- category: quotes / construct triggers (staged on port side; must not panic) ---
['"', 'a"', '"a', '""', 'a["', '[', ']', 'a[', 'a]', '[]', '[[', ']]', '{', '}', 'a{', 'a}', '{}', '(', ')', 'a(', 'a)', '()', '!(a)', '!!!a', '!a', '!', '!!', '?', '??', '*', '**', '*/', '@(', '@a', '+(a)', '@', '+', '|', ',', 'a|b', 'a,b', 'a[({'].forEach(p => add(p));

// --- category: strictBrackets interactions (loop throws are staged) ---
add('a[', { strictBrackets: true }); add('a]', { strictBrackets: true });
add('a(', { strictBrackets: true }); add('a)', { strictBrackets: true });
add('a{', { strictBrackets: true }); add('a}', { strictBrackets: true });
add('[', { strictBrackets: true }); add('a[({', { strictBrackets: true });

// --- category: length guards, ASCII boundaries ---
for (const n of [65535, 65536, 65537]) add('*'.repeat(n));
for (const n of [65534, 65535, 65536, 65537]) add('a'.repeat(n));
// --- category: length guards, astral boundaries (2 units per char) ---
for (const n of [32766, 32767, 32768, 32769]) add(emoji.repeat(n));
add(emoji.repeat(501), { maxLength: 1000 });
add(emoji.repeat(500), { maxLength: 999 });

// --- category: maxLength matrix (message-byte checks on clamps / NaN passthrough) ---
const six = 'a'.repeat(600);
[599, 600, 601, 0, -1, -5, 500.5, 599.5, 1e9, 'NaN', 'Infinity', '-Infinity', '-0', null].forEach(m => add(six, { maxLength: m }));
for (const m of [3, 2.5, 0, -1]) add('abc', { maxLength: m });

// --- category: prepend oddities (bos token output) ---
[undefined, '', 'PRE', '^', '\\', '.', '(?!)'].forEach(p => add('a', { prepend: p }));
['PRE', ''].forEach(p => add('***', { prepend: p }));
add('./x', { prepend: 'PRE' }); add('./', { prepend: 'PRE' });

// --- category: option toggles on loop-free patterns (dot flag; platform binding) ---
for (const p of ['abc', 'a/b', '.x', '***', './a']) {
  add(p, { dot: true }); add(p, { dot: false });
  add(p, { windows: true }); add(p, { capture: true }); add(p, { bash: true });
  add(p, { fastpaths: false });
}

// --- category: NUL + replacement interplay ---
add('***\u0000'); add('\u0000' + emoji);

// top up to N with random-ish literal soup (deterministic PRNG)
let seed = 0xC0FFEE;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const alphabet = ['a', 'Z', '0', '.', '/', '^', '$', ' ', '\\', emoji, '-', '_', 'é'];
while (cases.length < N) {
  const len = 1 + Math.floor(rnd() * 24);
  let p = '';
  for (let k = 0; k < len; k++) p += alphabet[Math.floor(rnd() * alphabet.length)];
  add(p);
}

// --- run both probes ---
const jsonl = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
const ref = path.join(__dirname, 'probe-c0.js');
const jsOut = execFileSync('node', [ref], { input: jsonl, maxBuffer: 1 << 26 }).toString();
const rsOut = execFileSync(path.join(__dirname, '..', 'target', 'debug', 'examples', 'c0probe'), [], { input: jsonl, maxBuffer: 1 << 26 }).toString();
const js = new Map(jsOut.trim().split('\n').map(l => { const r = JSON.parse(l); return [r.i, r]; }));
const rs = new Map(rsOut.trim().split('\n').map(l => { const r = JSON.parse(l); return [r.i, r]; }));

const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const divergences = [];
let staged = 0, panics = 0, compared = 0;

for (const c of cases) {
  const a = js.get(c.i), b = rs.get(c.i);
  if (!a || !b) { divergences.push({ i: c.i, kind: 'missing-row', c, a: !!a, b: !!b }); continue; }
  if (a.kind === 'error' || b.kind === 'error') {
    if (a.kind === 'error' && a.c0Owned === false) {
      staged++; // loop-owned throw (strictBrackets etc.) — C1..C7 territory
      continue;
    }
    compared++;
    if (a.kind !== b.kind || a.class !== b.class || a.message !== b.message) {
      divergences.push({ i: c.i, kind: 'error-bytes', c, js: { kind: a.kind, class: a.class, message: a.message }, rs: { kind: b.kind, class: b.class, message: b.message } });
    }
    continue;
  }
  compared++;
  // always-comparable C0 surface
  for (const f of ['input', 'prefix', 'dot']) {
    if (!eq(a[f], b[f])) divergences.push({ i: c.i, kind: `field:${f}`, c, js: a[f], rs: b[f] });
  }
  if (a.route === 'fastpath') {
    // loop-free in the original → full C0 shape except output (C1-owned)
    for (const f of ['index', 'start', 'consumedUnits', 'negated', 'backtrack', 'brackets', 'braces', 'parens', 'quotes', 'globstar', 'negatedExtglob', 'tokens']) {
      if (!eq(a[f], b[f])) divergences.push({ i: c.i, kind: `fastpath-shape:${f}`, c, js: a[f], rs: b[f] });
    }
  } else {
    // loop-route: only invariants that C0 owns even across the loop survive:
    // nothing beyond input/prefix/dot is C0-pure; count for the report.
    staged++;
  }
}
if (rsOut.includes('probeError')) panics++;

console.log(`inputs: ${cases.length} | compared-1:1: ${compared} | staged(loop-owned): ${staged}`);
const real = divergences.filter(d => d.kind !== 'missing-row');
console.log(`divergences: ${real.length}`);
for (const d of real.slice(0, 30)) console.log(JSON.stringify(d));
if (panics) console.log(`PANICS in rust probe: ${panics}`);
