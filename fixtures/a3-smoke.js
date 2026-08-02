'use strict';

/**
 * A3 smoke — picomatch.toRegex surface vs the reference's toRegex behavior.
 * node fixtures/a3-smoke.js
 */

const path = require('path');
const assert = require('assert');

const REF = path.join(__dirname, '..', '..', 'Main');
const pm = require(REF);
const adapter = require(path.join(__dirname, '..', 'adapter'));

const cases = [
  { source: pm.makeRe('*.js').source, inputs: ['a.js', 'a.ts', 'a/b.js'], flags: '' },
  { source: pm.makeRe('**/b').source, inputs: ['b', 'a/b', 'a/b/c'], flags: '' },
  { source: '^(?:A)$', inputs: ['a', 'A', 'b'], flags: 'i' },
  { source: pm.makeRe('a?b').source, inputs: ['acb', 'ab', 'a?b'], flags: '' }
];

let pass = 0;
for (const c of cases) {
  const rx = adapter.toRegex(c.source, { flags: c.flags || undefined });
  const ref = new RegExp(c.source, c.flags);
  for (const input of c.inputs) {
    const got = rx.test(input);
    const expected = ref.test(input);
    if (got === expected) pass++;
    else console.log(`DIFF: /${c.source}/ vs input ${JSON.stringify(input)}: pmx=${got} v8=${expected}`);
  }
}
assert.strictEqual(pass, cases.reduce((n, c) => n + c.inputs.length, 0), 'all toRegex.test calls must match V8');
assert.strictEqual(adapter.toRegex('^(?:x)$', {}).source, '^(?:x)$', 'wrapper.source');
let threw = false;
try { adapter.toRegex('x', {}).exec(() => {}); } catch (e) { threw = /TODO\(pmx\)/.test(e.message); }
assert.strictEqual(threw, true, '.exec stays TODO-loud');
console.log(`a3-smoke: ${pass}/${pass} toRegex.test parity ✓ | wrapper surface ✓ | exec TODO ✓`);
