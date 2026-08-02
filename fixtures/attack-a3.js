'use strict';

/**
 * attack-a3.js — differential: V8 RegExp vs pmx-exec (regress).
 * Sources come from the reference's own makeRe production pipeline over the
 * C0-C3-owned wildcard grammar; every (source, input) pair compares
 * `new RegExp(source, flags).test(input)` in V8 against `regexTest` in pmx.
 *
 * node fixtures/attack-a3.js
 */

const path = require('path');
const { spawnSync } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'Main');
const pm = require(REF); // reference picomatch (makeRe entry)

const BIN = path.join(__dirname, '..', 'target', 'debug', 'pmx');

// C0-C3-owned wildcard grammar (no braces/brackets/extglobs/globstars)
const pieces = ['a', 'b', 'foo', '?', '*', '.', '/', '\\', '"', 'a?', 'a*', '?.', '*a', 'a/', '*', '?', '.a', 'a.'];
const patterns = new Set();
for (const a of pieces) for (const b of pieces) patterns.add(a + b);
for (const a of pieces) for (const b of pieces) for (const c of ['a', '?', '*', '/']) patterns.add(a + b + c);
const optsList = [{}, { dot: true }, { bash: true }, { capture: true }, { nocase: true }, { windows: true }];

const inputs = ['', 'a', 'b', 'ab', 'a/b', 'a.b', '.a', 'A', 'AB', 'a1', '1a', 'a-b', 'a b', 'foo', 'foar', 'a?b', 'a*b', 'a**', '😀', 'a😀', '\\', 'a\\', 'a"'];

const cases = [];
for (const pattern of patterns) {
  if (/\*\*/.test(pattern)) continue; // globstar-class is C8, not engine-relevant here
  for (const options of optsList) {
    let mr;
    try { mr = pm.makeRe(pattern, options); } catch { continue; }
    const flags = options.nocase ? 'i' : '';
    for (const input of inputs) {
      cases.push({ pat: pattern, options, source: mr.source, input, flags });
    }
  }
}
console.log(`attack-a3: ${cases.length} cases`);

const rsInput = cases.map((c, k) => JSON.stringify({ i: k, op: 'regexTest', source: Array.from({ length: c.source.length }, (_, j) => c.source.charCodeAt(j)), input: c.input, flags: c.flags })).join('\n') + '\n';
const rs = spawnSync(BIN, ['--serve'], { input: rsInput, encoding: 'utf8', maxBuffer: 1 << 27, env: { ...process.env, PMX_QUIET: '1' } });
if (rs.status !== 0) { console.error('pmx --serve failed:', rs.stderr.slice(0, 300)); process.exit(1); }
const answers = rs.stdout.trim().split('\n');

let astralClass = 0, other = 0, errors = 0;
for (let k = 0; k < cases.length; k++) {
  const c = cases[k];
  const rx = new RegExp(c.source, c.flags);
  const expected = rx.test(c.input);
  const ans = JSON.parse(answers[k]);
  if (ans.kind === 'error') {
    errors++;
    if (errors <= 5) console.log('ENGINE-ERR', JSON.stringify({ pat: c.pat, source: c.source.slice(0, 80), err: ans.message.slice(0, 120) }));
    continue;
  }
  if (ans.matched !== expected) {
    // classify: astral INPUT char + widened bracket-class reach (see DECISIONS D-018)
    const isAstralBoundary = /[\uD800-\uDFFF]/.test(c.input);
    if (isAstralBoundary) astralClass++;
    else {
      other++;
      if (other <= 6) console.log('DIV', JSON.stringify({ pat: c.pat, source: c.source, input: c.input, flags: c.flags, expected, actual: ans.matched }));
    }
  }
}
console.log(`attack-a3: ${cases.length} compared | astral-class boundary (D-018): ${astralClass} | other divergences: ${other} | engine errors: ${errors}`);
process.exitCode = other === 0 && errors === 0 ? 0 : 1;
