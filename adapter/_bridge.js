'use strict';

/**
 * Shared bridge between the JS adapter and the `pmx --serve` subprocess.
 *
 * Mocha tests are SYNCHRONOUS, so each call is a spawnSync round-trip.
 * (Correct-by-construction first; the batch/napi transport belongs to a later
 * performance chunk, not to a parity adapter.)
 */

const { execFileSync } = require('child_process');
const path = require('path');

const BIN = path.join(__dirname, '..', 'target', 'debug', 'pmx');
const MODE = process.env.PMX_ADAPTER === 'napi' ? 'napi' : 'serve';
let missing = 0;
let nativeMod = null;

if (MODE === 'napi') {
  const modPath = path.join(__dirname, 'native', 'pmx_node.node');
  try {
    nativeMod = require(modPath);
  } catch (err) {
    throw new Error(`PMX_ADAPTER=napi requires the addon at ${modPath} — run: cargo build -p pmx-node && cp target/debug/libpmx_node.${process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so'} adapter/native/pmx_node.node\n` + err.message);
  }
}

/** Single JSONL op; returns the decoded answer row or throws the adapter's error.
 * If options.expandRange is a JS function and PMX_ADAPTER=napi, the callback is
 * shipped into the parse loop via bridgeOpExpand (BUG-005's protocol).
 * The subprocess transport can't ship callbacks — documented in BUG-005. */
function bridgeRaw(payload) {
  let answer;
  if (MODE === 'napi' && payload && payload.options && typeof payload.options.expandRange === 'function') {
    const expandFn = payload.options.expandRange;
    const wire = { ...payload, options: { ...payload.options, expandRange: undefined } };
    answer = JSON.parse(nativeMod.bridgeOpExpand(JSON.stringify(wire), expandFn));
  } else if (MODE === 'napi') {
    answer = JSON.parse(nativeMod.bridgeOp(JSON.stringify(payload)));
  } else {
    answer = spawnAnswer(payload);
  }
  if (answer.kind === 'error') {
    const err = answer.class === 'TypeError' ? new TypeError(answer.message) : new SyntaxError(answer.message);
    throw err;
  }
  return answer;
}

function spawnAnswer(payload) {
  let raw;
  try {
    raw = execFileSync(BIN, ['--serve'], {
      input: JSON.stringify(payload) + '\n',
      encoding: 'utf8',
      maxBuffer: 1 << 26,
      env: { ...process.env, PMX_QUIET: '1' }
    });
  } catch (err) {
    if (missing++ === 0) {
      err.message = `pmx binary missing at ${BIN} — run \`cargo build -p pmx-cli\` first. ` + err.message;
    }
    throw err;
  }
  const line = raw.split('\n').find(l => l.trim());
  if (!line) throw new Error(`pmx --serve returned no answer`);
  return JSON.parse(line);
}

function bridge(op, pattern, options) {
  return bridgeRaw({ op, pattern: String(pattern), options: options || {} });
}

/** u16 unit arrays back to JS strings (preserves lone surrogate halves). */
const u16s = v => (Array.isArray(v) ? String.fromCharCode(...v) : v);

module.exports = { bridge, bridgeRaw, u16s, BIN };
