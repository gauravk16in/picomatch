'use strict';

/**
 * C1 corpus extractor — inline fastpath (L606-L655) + main loop C1 branches
 * (NUL L664, escapes L672-711, quotes L765-782, text L1109-1122).
 * Rows are derived 100% from the reference lib; Rust asserts byte/unit identity.
 * node fixtures/extract-c1.js → fixtures/c1_oracle.json
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REF = path.join(__dirname, '..', '..', 'Main');
const parse = require(path.join(REF, 'lib', 'parse'));

const { canonState } = require('./canon');

const E = '\u{1F600}';
const SLOW = { fastpaths: false };

const CASES = [
  // ---- inline fastpath family (default options) ----
  { id: 'fp.literal.run', pattern: 'foo.bar,baz', options: {}, note: 'dots+commas: comma is \\W → escaped (L635)' },
  { id: 'fp.star.mid', pattern: 'a*b', options: {}, note: '' },
  { id: 'fp.star.run', pattern: 'a**b', options: {}, note: 'star RUN collapses to one fragment (L633)' },
  { id: 'fp.star.tail', pattern: 'a*', options: {}, note: 'fp route returns early: NO maybe_slash affix' },
  { id: 'fp.qmark.start', pattern: '?ab', options: {}, note: 'offset-0 ? ⇒ QMARK_NO_DOT (L619-621)' },
  { id: 'fp.qmark.start.dot', pattern: '?ab', options: { dot: true }, note: 'qmarkNoDot resolved at init with dot:true ⇒ QMARK' },
  { id: 'fp.qmark.mid', pattern: 'a?b', options: {}, note: '' },
  { id: 'fp.qmark.run', pattern: 'a??b', options: {}, note: 'QMARK×2 (L622)' },
  { id: 'fp.qmark.esc', pattern: 'a\\?b', options: {}, note: 'esc kept (L616-618)' },
  { id: 'fp.qmark.escrun', pattern: 'a\\??b', options: {}, note: 'escape + QMARK tail' },
  { id: 'fp.qmark.end', pattern: 'ab?', options: {}, note: '' },
  { id: 'fp.qmark.windows', pattern: '?ab', options: { windows: true }, note: 'QMARK windows fragment [^\\\\/]' },
  { id: 'fp.dot.run', pattern: 'a..b', options: {}, note: 'DOT_LITERAL×2 (L625-627)' },
  { id: 'fp.dot.esc', pattern: 'a\\.b', options: {}, note: 'NO escaped-dot branch: esc dropped (L625-L627 has no esc arm!)' },
  { id: 'fp.dot.start', pattern: '.git', options: {}, note: '' },
  { id: 'fp.asc.star', pattern: 'a\\*b', options: {}, note: '' },
  { id: 'fp.star.escrun', pattern: 'a\\**b', options: {}, note: 'esc + star frag for tail (L630-631)' },
  { id: 'fp.bs.word', pattern: 'a\\bc', options: {}, note: 'word-boundary feature survives replace (regex-features.js)' },
  { id: 'fp.bs.semi', pattern: 'a\\;b', options: {}, note: 'esc-any branch: backslash kept raw; NO collapse (flag unset on non-bs first)' },
  { id: 'fp.bs.run2', pattern: 'a\\\\b', options: {}, note: 'collapse: run 2 even → 2 backslashes in OUTPUT' },
  { id: 'fp.bs.run3', pattern: 'a\\\\\\b', options: {}, note: 'run 3 odd → 1 backslash' },
  { id: 'fp.bs.run4', pattern: 'a\\\\\\\\b', options: {}, note: 'run 4 even → 2' },
  { id: 'fp.bs.trailing', pattern: 'a\\', options: {}, note: 'single trailing bs: run 1 odd → 1' },
  { id: 'fp.bs.unescape', pattern: 'a\\*b', options: { unescape: true }, note: 'L640: all backslashes stripped' },
  { id: 'fp.dollar', pattern: 'a$b', options: {}, note: '' },
  { id: 'fp.caret', pattern: 'a^b', options: {}, note: '' },
  { id: 'fp.caret.start', pattern: '^a', options: {}, note: '' },
  { id: 'fp.comma.dash.semi', pattern: 'a,b-c;d', options: {}, note: '' },
  { id: 'fp.pojo-protect', pattern: '__proto__', options: {}, note: 'literal special keys (malicious.js)' },
  { id: 'fp.contains.noop', pattern: 'abc', options: { contains: true }, note: 'output===input ⇒ bare state.output = input (L648-651)' },
  { id: 'fp.contains.special', pattern: 'a.b', options: { contains: true }, note: 'special present ⇒ wrap WITHOUT anchors (contains drops them)' },
  { id: 'fp.capture.star', pattern: 'a*b', options: { capture: true }, note: 'star wrapped in () at init (L403-405)' },
  { id: 'fp.astral', pattern: 'a' + E + 'b', options: {}, assert: ['output'], note: 'ILL-FORMED-16 proof: escape inserted between surrogate halves; corpus carries __u16' },

  // ---- slow loop family (fastpaths:false or routing-excluded) ----
  { id: 'sl.escape.simple', pattern: 'a\\*b', options: SLOW, note: '' },
  { id: 'sl.escape.word', pattern: 'a\\bc', options: SLOW, note: '' },
  { id: 'sl.escape.run3', pattern: 'a\\\\\\b', options: SLOW, note: 'main-loop collapse at L690-699 (run>2)' },
  { id: 'sl.escape.run2', pattern: 'a\\\\b', options: SLOW, note: 'run ≤ 2: NO main-loop collapse; \\ and \\ kept' },
  { id: 'sl.escape.trailing', pattern: 'a\\', options: SLOW, note: 'L683-687: value doubled to raw \\\\' },
  { id: 'sl.escape.dropdot', chunk: 2, pattern: 'a\\.b', options: SLOW, note: 'C2: bs dropped by L679, then the DOT branch emits DOT_LITERAL — NOT same bytes as C1 text fallback (proved)' },
  { id: 'sl.escape.dropsemi', pattern: 'a\\;b', options: SLOW, note: '' },
  { id: 'sl.escape.unescape', pattern: 'a\\*b', options: { ...SLOW, unescape: true }, note: 'L701-702: backslash dropped, char kept' },
  { id: 'sl.escape.bash-slash', pattern: 'a\\/b', options: { ...SLOW, bash: true }, note: 'bash keeps the backslash+slash as text (L675 skipped); non-bash slash path is C2-owned (DIFFERENT bytes — not rowed here)' },
  { id: 'sl.quotes.basic', pattern: 'a"bc"d', options: {}, note: 'routing forces slow loop (")' },
  { id: 'sl.quotes.special', chunk: 3, pattern: 'a"+*^"b', options: {}, note: 'C3-owned: contains an unguarded * (star branch) — see staging note below' },
  { id: 'sl.quotes.keep', pattern: 'a"bc"d', options: { keepQuotes: true }, note: 'quote chars emitted as text (L778-780)' },
  { id: 'sl.quotes.unclosed', pattern: 'a"bc', options: {}, note: 'quotes counter left at 1; no recovery handles it' },
  { id: 'sl.quotes.empty', pattern: 'a""b', options: {}, note: '' },
  { id: 'sl.quotes.astral', pattern: 'a"' + E + '"b', options: {}, note: 'paired halves recombine inside quotes (still well-formed)' },
  { id: 'sl.quotes.special-staging', chunk: 3, pattern: 'a"+*^"b', options: {}, note: 'C3: JS text-run eats the quote before it can toggle, so unguarded * hits the STAR branch even "inside quotes" — C1 text-fallback diverges by design' },
  { id: 'sl.quotes.dotstar-staging', chunk: 3, pattern: 'a".*"b', options: {}, note: 'C3: same staging class (star branch), not C1-comparable' },
  { id: 'sl.nul', pattern: 'a\u0000b', options: SLOW, note: 'NUL silently skipped (L664)' },
  { id: 'sl.nul.fp', pattern: 'a\u0000b', options: {}, note: 'fp route: NUL is \\W → escaped to BS+NUL' },
  { id: 'sl.dollar.caret', pattern: '^a$b', options: SLOW, note: '' },
  { id: 'sl.merge.esc-prev', pattern: 'a$bC', options: SLOW, note: 'merge: prev.output = prev-output + tok.VALUE (raw-escape pair), not tok.output' },
  { id: 'sl.text.astral-merge', chunk: 2, pattern: 'a' + E + '.b', options: SLOW, note: 'C2: dot branch present ⇒ divergent until C2' },
];

const runCase = c => {
  try {
    const s = parse(c.pattern, c.options || {});
    return { kind: 'ok', utf16Length: c.pattern.length, state: canonState(s) };
  } catch (err) {
    return { kind: 'error', class: err.constructor.name, message: err.message };
  }
};

const rows = CASES.map(c => ({
  id: c.id,
  chunk: c.chunk == null ? 1 : c.chunk,
  layer: 'core',
  jsOnly: false,
  active: (c.chunk == null ? 1 : c.chunk) <= 2,
  pattern: c.pattern,
  options: c.options || {},
  assert: c.assert,
  note: c.note,
  expect: runCase(c)
}));

const doc = {
  meta: {
    corpus: 'c1-dispatcher',
    generator: 'fixtures/extract-c1.js',
    reference: path.join('..', 'Main') + ' (read-only checkout)',
    picomatchVersion: require(path.join(REF, 'package.json')).version,
    fieldPolicy: 'u16-unit sequences for emitted text (canon.js); assert-all when no assert list'
  },
  cases: rows
};

const json = JSON.stringify(doc, null, 1) + '\n';
const out = path.join(__dirname, 'c1_oracle.json');
fs.writeFileSync(out, json);
const sha = crypto.createHash('sha256').update(json).digest('hex');
process.stderr.write(`wrote ${out}\nsha256 ${sha}\ncases ${rows.length}\n`);
