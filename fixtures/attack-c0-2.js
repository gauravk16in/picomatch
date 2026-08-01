'use strict';

/**
 * REVIEW ATTACK — iteration 2 (review tooling, not port code).
 * Independent re-attack of the C0 surface with a fresh case list:
 *  - prefix/prepends (' ./ // ././a etc.), multi-byte + control chars
 *  - maxLength boundary == len, 65535/65536/65537
 *  - js_number surface: 1e21/1e20/1e-6/1e-7/subnormal/-0/±Infinity via message bytes
 * Comparison policy identical in spirit to attack-c0.js:
 *  error rows  -> class + message BYTES (loop-owned throws staged via c0Owned)
 *  ok rows     -> input/prefix/dot always; fastpath-route rows also the full
 *                 shape EXCEPT output (C1-owned inline fastpath anchors)
 *
 * node fixtures/attack-c0-2.js
 */

const { execFileSync } = require('child_process');
const path = require('path');

const emoji = '\u{1F600}'; // 2 UTF-16 units
const cases = [];
const add = (pattern, options) => cases.push({ i: cases.length, pattern, options: options || {} });

// --- prefix / prepend edge shapes (prompt-required) ---
['', "'", "''", './', '././a', './././x', './/a', '//', '///', '////', '/./a', './.', './..', '../a', '..', '.', 'a/', '/a', "'a", "a'", "a'b", '"', '""', 'a"', '`', '``'].forEach(p => add(p));

// --- multi-byte / unicode soup (BMP + astral + combining + NBSP + BOM) ---
['é', '中', '中文路径', emoji, 'a' + emoji + 'b', emoji + '.' + emoji, 'é', 'éx', ' ', ' x', '﻿', 'x﻿y', 'ﬀ', 'Ω', '§', '¿', '\u0378', '\uD7FF', '\uE000', '\uFFFD'].forEach(p => add(p));

// --- control chars / whitespace inside patterns ---
['a\nb', '\n', '\r\n', 'a\tb', '\t', 'a\vb', 'a\fb', 'a\bb', 'a\eb', 'a\0b', '\0', 'a␀', '\x7f', 'a\x80b', 'x\ry\nz', ' \t ', '\n***', '***\n'].forEach(p => add(p));

// --- REPLACEMENTS exact keys + adversarial near-misses ---
['***', '**/**', '**/**/**', '***', ' ***', '*** ', '*****/**', '**/***/**', '**//**', '**/**/', '/**/**', '**/**x', 'x**/**', '******', '*********', '**​/**' /* zero-width */, '**/**\0'].forEach(p => add(p));
add('***', { maxLength: 1 });     // substituted '*' (len 1) measured AFTER replacement
add('**/**/**', { maxLength: 2 });
add('**/**', { maxLength: 1 });   // substituted '**' len 2 > 1 -> throw with max 1

// --- maxLength boundary == len (prompt-required) + 65535/65536/65537 ---
for (const L of [1, 2, 3, 7, 504, 600, 4096, 65534, 65535, 65536, 65537]) {
  const p = 'a'.repeat(L);
  add(p, { maxLength: L - 1 });
  add(p, { maxLength: L });       // boundary: len > max is false -> no throw
  add(p, { maxLength: L + 1 });
}
for (const n of [65535, 65536, 65537]) { add('*'.repeat(n)); add('a'.repeat(n)); add('/'.repeat(n)); }
add(emoji.repeat(32768));         // exactly 65536 units
add(emoji.repeat(32768), { maxLength: 65536 });
add(emoji.repeat(32768), { maxLength: 65535 });
add('é'.repeat(65536));           // 65536 units, 2 UTF-8 bytes each
add('é'.repeat(65536), { maxLength: 65536 });

// --- js_number surface via InputTooLong.max (prompt-required number formats) ---
const one = 'a';
const matrix = [
  1e21, 1e20, 2.5e21, 1e100, 1.7976931348623157e308, 5e-324, 1e-6, 1e-7, 1.5e-7, 0.1 + 0.2,
  0.30000000000000004, -1e7, -1e21, -1e20, -2.5e21, -1e100, -1.7976931348623157e308,
  -5e-324, -1e-6, -1e-7, -1.5e-7, -0.000001, -0.0000001, -123456.789, 599.5, 500.5, 2.5,
  0, -0, 0.5, 1, 2, 65535, 65536, 65537, 1e9, 1e15, 123456789012345680000, 9007199254740993,
  'NaN', 'Infinity', '-Infinity', '-0', null, undefined, '100', '65535', true, false, {}, []
];
for (const m of matrix) add(one, { maxLength: m });
for (const m of [7, 6, 6.5, -1e21, 1e-7, 5e-324, '-0', 'NaN']) add('abcdefg', { maxLength: m });
// number formatting where len is multi-digit and max has fraction/exponent
for (const m of [599.5, 600, 600.0000001, -Number.MIN_VALUE]) add('a'.repeat(600), { maxLength: m });

// --- prepend oddities incl. regex bombs, on loop-free literal patterns ---
['((', '(?!)', '(?:', '***', '\\', '\n', emoji, 'é', ' ', '\0', '^', '$'].forEach(p => add('a', { prepend: p }));
['x', 'a/b', './a', './'].forEach(p => add(p, { prepend: './' }));

// --- option toggles incl. noext fold (c0-1 table rows) on loop-free patterns ---
for (const p of ['abc', 'é', 'a/b', './x']) {
  add(p, { noext: true }); add(p, { noext: false }); add(p, { noextglob: true });
  add(p, { strictSlashes: true }); add(p, { strictSlashes: false });
  add(p, { windows: true, dot: true, capture: true, bash: true });
}

// --- deterministic random literal soup (fresh seed vs iteration 1) ---
let seed = 0x17E42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const alphabet = ['a', 'Z', '9', '.', '/', './', "'", '"', '^', '$', '\\', emoji, 'é', '\n', '\t', '\0', ' ', '~', ',', '|'];
while (cases.length < 340) {
  const len = 1 + Math.floor(rnd() * 20);
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
    if (a.kind === 'error' && a.c0Owned === false) { staged++; continue; }
    compared++;
    if (a.kind !== b.kind || a.class !== b.class || a.message !== b.message) {
      divergences.push({ i: c.i, kind: 'error-bytes', c, js: { kind: a.kind, class: a.class, message: a.message }, rs: { kind: b.kind, class: b.class, message: b.message } });
    }
    continue;
  }
  compared++;
  for (const f of ['input', 'prefix', 'dot']) {
    if (!eq(a[f], b[f])) divergences.push({ i: c.i, kind: `field:${f}`, c, js: a[f], rs: b[f] });
  }
  if (a.route === 'fastpath') {
    for (const f of ['index', 'start', 'consumedUnits', 'negated', 'backtrack', 'brackets', 'braces', 'parens', 'quotes', 'globstar', 'negatedExtglob', 'tokens']) {
      if (!eq(a[f], b[f])) divergences.push({ i: c.i, kind: `fastpath-shape:${f}`, c, js: a[f], rs: b[f] });
    }
  } else {
    staged++;
  }
}
if (rsOut.includes('probeError')) panics++;

console.log(`inputs: ${cases.length} | compared-1:1: ${compared} | staged(loop-owned): ${staged}`);
const real = divergences.filter(d => d.kind !== 'missing-row');
console.log(`divergences: ${real.length}`);
for (const d of real.slice(0, 40)) console.log(JSON.stringify(d));
if (panics) console.log(`PANICS in rust probe: ${panics}`);
