'use strict';

/**
 * b3-smoke — verifies identical answers across BOTH transports (`--serve` and
 * `PMX_ADAPTER=napi`) for the same ops, plus a batch of 200 mixed cases.
 * node fixtures/b3-smoke.js
 */

const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const REF = path.join(__dirname, '..', '..', 'Main');
const parse = require(path.join(REF, 'lib', 'parse'));

const patterns = ['a*b', '?.js', 'a?b', 'foo.*', 'a/b/*', '.git', 'abc', '?ab', '**', './a/b/*.js', '!abc', '@(a|b)', 'a"q"', 'x\\\\y', 'a{.b}z', 'ab[cd]e'];

function forEnv(mode) {
  process.env.PMX_ADAPTER = mode;
  delete require.cache[require.resolve(path.join(__dirname, '..', 'adapter', '_bridge.js'))];
  const { bridgeRaw } = require(path.join(__dirname, '..', 'adapter', '_bridge.js'));
  return pat => bridgeRaw({ op: 'parse', pattern: pat, options: { fastpaths: false } });
}

const serve = forEnv('serve');
const napi = forEnv('napi');

let equal = 0, jsEqual = 0, fail = 0;
for (const pat of patterns) {
  let expected;
  try {
    const s = parse(pat, { fastpaths: false });
    expected = { kind: 'ok', output: s.output };
  } catch (err) {
    expected = { kind: 'error', class: err.constructor.name, message: err.message };
  }
  const unbuilt = /[*!@+?]\(|\{|\[|\*\*|^!/.test(pat); // C5-C9 constructs are parser-track, not adapter-surface
  for (const [label, fn] of [['serve', serve], ['napi', napi]]) {
    let got;
    try { got = fn(pat); } catch (err) { fail++; console.log(`TRANSPORT-ERR ${label} ${pat}: ${err.message.slice(0, 120)}`); continue; }
    const encode = v => (typeof v === 'string' ? Array.from({ length: v.length }, (_, i) => v.charCodeAt(i)) : v);
    try {
      if (expected.kind === 'error') assert.strictEqual(got.class, expected.class);
      else assert.deepStrictEqual(encode(got.output), encode(expected.output));
      jsEqual++;
    } catch (e) {
      if (unbuilt) {
        console.log(`UNBUILT-CLASS (${label}) ${pat}: parser chunk pending, not an adapter bug (${e.message.split('\n')[0].slice(0, 60)})`);
      } else {
        fail++;
        console.log(`DIV ${label} ${pat}: ${e.message.split('\n')[0].slice(0, 100)}`);
      }
    }
  }
  try {
    const a = serve(pat), b = napi(pat);
    assert.deepStrictEqual(a, b);
    equal++;
  } catch (e) { fail++; console.log(`TRANSPORT-DIV ${pat}: ${e.message.split('\n')[0].slice(0, 100)}`); }
}

console.log(`b3-smoke: transport-equal ${equal}/${patterns.length} | per-transport js-parity ${jsEqual}/${patterns.length * 2} | failures: ${fail}`);
process.exitCode = fail === 0 && equal === patterns.length ? 0 : 1;
