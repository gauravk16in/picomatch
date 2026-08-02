'use strict';

/**
 * C0 corpus extractor — runs the REFERENCE picomatch (../picomatch, read-only)
 * and serializes observable C0 behavior to c0_oracle.json.
 *
 * Assert-key policy:
 *   - cases WITHOUT `assert` list: every recorded field is asserted on activation
 *   - cases WITH `assert`: only the listed keys are asserted (future-stability guard)
 *   - `chunk` = the implementation chunk whose absence changes the asserted values
 *   - `active` now <=> chunk === 0 && !jsOnly
 *   - extra keys: 'tokens0' → state.tokens[0], 'utf16Length' → UTF-16 unit count
 *
 * node fixtures/extract-c0.js  →  fixtures/c0_oracle.json, sha256 to stderr.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REF = path.join(__dirname, '..', '..', 'Main');
const parse = require(path.join(REF, 'lib', 'parse'));
const pm = require(REF);

const emoji = '\u{1F600}'; // one astral char == 2 UTF-16 units in JS

const SHAPE_C0 = ['input', 'prefix', 'dot', 'negated', 'backtrack', 'brackets', 'braces', 'parens', 'quotes', 'globstar', 'negatedExtglob'];

const CASES = [
  // --- guards / messages (C0-pure) ---
  { id: 'guard.len.default', chunk: 0, pattern: '*'.repeat(65537), options: {}, assert: ['kind'], note: 'default MAX_LENGTH throw, exact bytes (parse.js:L367-369) -- assert full error pair' },
  { id: 'guard.len.custom', chunk: 0, pattern: '('.repeat(504), options: { maxLength: 499 }, note: 'clamped max appears in message (test/malicious.js:28-31)' },
  { id: 'guard.len.clamp-above', chunk: 0, pattern: '*'.repeat(65537), options: { maxLength: 1e9 }, note: 'max reports Math.min(65536, 1e9) === 65536' },
  { id: 'guard.len.fraction', chunk: 0, pattern: 'aa'.repeat(252), options: { maxLength: 500.5 }, note: 'JS number interpolation: max prints 500.5' },
  { id: 'guard.len.negative', chunk: 0, pattern: 'a', options: { maxLength: -5 }, note: 'JS number coercion admits negative limits' },
  { id: 'guard.len.astral', chunk: 0, pattern: emoji.repeat(501), options: { maxLength: 1000 }, note: '1002 UTF-16 units > 1000 — the Vec<u16> basis proof with a small fixture' },
  { id: 'guard.len.neg-zero', chunk: 0, pattern: 'a', options: { maxLength: -0 }, note: 'JS String(-0) === "0" — max prints 0, not -0 (review c0-1)' },
  { id: 'guard.len.neg-infinity', chunk: 0, pattern: 'a', options: { maxLength: -Infinity }, note: 'prints "-Infinity"; JSON can\'t carry it → canon encOptions { __num }' },
  { id: 'guard.len.neg-exp', chunk: 0, pattern: 'a', options: { maxLength: -0.0000001 }, note: 'JS exponent form below 1e-6 → "-1e-7"; Rust Display would print "-0.0000001"' },
  { id: 'guard.len.subnormal', chunk: 0, pattern: 'a', options: { maxLength: 5e-324 }, note: 'min subnormal prints "5e-324"' },
  { id: 'guard.type.nonstring', chunk: 0, layer: 'core', jsOnly: true, input: 123, options: {}, note: 'parse(123) TypeError — unreachable from core parse(&str); adapter-owned (I-6)' },

  // --- REPLACEMENTS via state.input (C0-pure, parse.js:L361) ---
  { id: 'repl.stars', chunk: 0, pattern: '***', options: {}, assert: ['input'], note: 'substituted before anything else (parse.js:L361)' },
  { id: 'repl.globstar-slash', chunk: 0, pattern: '**/**', options: {}, assert: ['input'], note: '' },
  { id: 'repl.globstar-slash-2', chunk: 0, pattern: '**/**/**', options: {}, assert: ['input'], note: '' },

  // --- removePrefix semantics (C0-pure, utils.js:L43-50) ---
  { id: 'prefix.dotslash', chunk: 0, pattern: './a/b', options: {}, assert: ['prefix', 'input'], note: 'state.prefix set; state.input RETAINS the full original string' },
  { id: 'prefix.dotslash-only', chunk: 0, pattern: './', options: {}, assert: ['prefix', 'input'], note: '' },
  { id: 'prefix.none', chunk: 0, pattern: 'a/b', options: {}, assert: ['prefix', 'input'], note: '' },

  // --- state shape & init ---
  { id: 'state.empty-pattern', chunk: 1, pattern: '', options: {}, note: 'I-7: returns (not throws). Output "^(?:)$" comes via the INLINE FASTPATH intercept + wrapOutput anchors (L606-655) — so this row activates with C1, not C0' },
  { id: 'state.shape-c0', chunk: 0, pattern: 'abc', options: {}, assert: SHAPE_C0, note: 'C0-stable structural fields only; output/tokens/index/consumed are C1-shaped (inline fastpath) and asserted separately in state.defaults' },
  { id: 'state.defaults', chunk: 1, pattern: 'abc', options: {}, note: 'full 16-field shape AS the inline fastpath leaves it: output "^(?:abc)$", tokens [bos] only, index stays -1' },
  { id: 'state.dot-flag', chunk: 0, pattern: 'a', options: { dot: true }, assert: ['dot'], note: 'dot copied verbatim (parse.js:L416)' },
  { id: 'init.prepend', chunk: 0, pattern: 'a', options: { prepend: 'PRE' }, assert: ['tokens0'], note: 'bos.output = prepend (parse.js:L371)' },
  { id: 'init.prepend-empty', chunk: 0, pattern: 'a', options: { prepend: '' }, assert: ['tokens0'], note: 'empty-string prepend is falsy: bos.output stays "" (JS || semantics)' },

  // --- staged: text branch (activates C1) ---
  { id: 'text.literal', chunk: 1, pattern: 'abc', options: { fastpaths: false }, note: 'slow loop: text branch; tokens [bos, text]; output unanchored "abc"' },
  { id: 'text.inline', chunk: 1, pattern: 'abc', options: {}, note: 'same pattern via inline fastpath — byte-DIFFERENT route, wrapOutput-anchored; both routes must be ported' },
  { id: 'text.merge', chunk: 2, pattern: 'a.b', options: { fastpaths: false }, note: 'C2 boundary: dot branch (L1008-1011) emits DOT_LITERAL on append — NOT C1-comparable; the merged token output ≠ state.output' },
  { id: 'text.dollar-caret', chunk: 1, pattern: 'a$b^c', options: { fastpaths: false }, note: '$ and ^ escaped at emission (parse.js:L1110-1112)' },
  { id: 'text.astral-index', chunk: 1, pattern: 'a' + emoji, options: { fastpaths: false }, assert: ['output', 'index'], note: 'slow loop, so the inline fastpath cannot hide index movement: end index is len-1 == 2 in UTF-16 units' },
  { id: 'guard.len.astral.ok', chunk: 1, pattern: emoji.repeat(250), options: { maxLength: 501 }, assert: ['utf16Length'], note: 'exactly 500 UTF-16 units under the 501 limit — no throw' },

  // --- staged: recovery + strictBrackets (activate with open branches) ---
  { id: 'rec.bracket-open', chunk: 6, pattern: 'a[', options: {}, note: 'C6 opens the counter; C0 recovery escapes; prev.type===bracket also pulls maybe_slash onto the output' },
  { id: 'rec.bracket-strict', chunk: 6, pattern: 'a[', options: { strictBrackets: true }, note: 'mid-loop throw L816-817 (C6 site)' },
  { id: 'rec.rbracket-strict', chunk: 6, pattern: 'a]', options: { strictBrackets: true }, note: 'L836-837 Missing opening "["' },
  { id: 'rec.paren-open-strict', chunk: 7, pattern: 'a(', options: { strictBrackets: true }, note: 'recovery-loop throw L1293 (open branch is C7)' },
  { id: 'rec.paren-close-strict', chunk: 7, pattern: 'a)', options: { strictBrackets: true }, note: 'mid-loop throw L795-796' },
  { id: 'rec.brace-strict', chunk: 5, pattern: 'a{', options: { strictBrackets: true }, note: 'recovery-loop throw L1299 (open branch is C5)' },
  { id: 'rec.mixed-strict-order', chunk: 7, pattern: 'a[({', options: { strictBrackets: true }, note: 'brackets loop throws FIRST (L1286 before L1292/L1298)' },
  { id: 'rec.mixed-lenient', chunk: 7, pattern: 'a[({', options: {}, note: 'all three escaped via repeated escapeLast, one per counter per iteration' },

  // --- staged: backtrack/journal (activates C5) ---
  { id: 'rebuild.range', chunk: 5, pattern: 'a{1..3}b', options: {}, note: 'range expansion sets backtrack; final output rebuilt from tokens (L1308-1319)' },

  // --- adapter-layer rows (picomatch() surface, not core) ---
  { id: 'api.empty-pattern', chunk: 0, layer: 'adapter', jsOnly: true, inputStr: 'foo', pattern: '', options: {}, note: 'picomatch() validation TypeError (picomatch.js:L58-60), asserted in test/api.picomatch.js:15' }
];

const { canonState, encOptions } = require('./canon');

const runCase = c => {
  const input = c.jsOnly && c.input !== undefined ? c.input : c.pattern;
  try {
    if (c.layer === 'adapter') {
      pm(c.pattern, c.options)(c.inputStr);
      return { kind: 'ok' };
    }
    const s = parse(input, c.options || {});
    return { kind: 'ok', utf16Length: input.length, state: canonState(s) };
  } catch (err) {
    return { kind: 'error', class: err.constructor.name, message: err.message };
  }
};

const rows = CASES.map(c => ({
  id: c.id,
  chunk: c.chunk,
  layer: c.layer || 'core',
  jsOnly: c.jsOnly === true,
  // activation threshold: rows unlock when their owning chunk lands (C3 now)
  active: (c.chunk || 0) <= 3 && c.jsOnly !== true,
  pattern: c.jsOnly ? undefined : c.pattern,
  options: encOptions(c.options || {}),
  assert: c.assert,
  note: c.note,
  expect: runCase(c)
}));

const doc = {
  meta: {
    corpus: 'c0-foundation',
    generator: 'fixtures/extract-c0.js',
    reference: path.join('..', 'Main') + ' (read-only checkout)',
    picomatchVersion: require(path.join(REF, 'package.json')).version,
    assertKeys: ['input', 'index', 'start', 'dot', 'prefix', 'backtrack', 'negated', 'brackets', 'braces', 'parens', 'quotes', 'globstar', 'negatedExtglob', 'output', 'consumed', 'tokens', 'tokens0', 'utf16Length', 'kind'],
    fieldPolicy: 'JSON field order = construction order; errors as {class,message}; tokens drop prev frames; dropped state fns: peek,advance; no default assert == all fields'
  },
  cases: rows
};

const json = JSON.stringify(doc, null, 1) + '\n';
const out = path.join(__dirname, 'c0_oracle.json');
fs.writeFileSync(out, json);
const sha = crypto.createHash('sha256').update(json).digest('hex');
process.stderr.write(`wrote ${out}\nsha256 ${sha}\ncases ${rows.length} (active ${rows.filter(r => r.active).length})\n`);
