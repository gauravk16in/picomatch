'use strict';

/**
 * TEST-ONLY bridge preload — lets the unmodified `Main/test/api.scan.js`
 * execute against the Rust scanner via a synchronous subprocess.
 *
 * Invoked by Mocha `--require <this-file>`. It MUST run BEFORE the test file
 * resolves `require('../lib/scan')`, so it patches the CommonJS require cache
 * for the exact resolved path (`D:\picomatch\Main\lib\scan.js` on this host —
 * computed dynamically via `Module._resolveFilename` to stay portable).
 *
 * The bridge:
 *  1. resolves the scan module path the SAME way Node would from the test file;
 *  2. injects a synthetic `Module` into `require.cache` exporting a `scan`
 *     function that:
 *     - serializes (input, options) to one JSONL line,
 *     - spawns the Rust `scanprobe` binary once per call with the line on stdin,
 *     - reads the JSONL projection from stdout,
 *     - reconstructs the EXACT JS object shape (absent vs present properties,
 *       Infinity via `__num`, UTF-16 unit arrays via `__u16`, token fields);
 *  3. fails loudly on any bridge/protocol/Rust error (never falls back to JS).
 *
 * It does NOT edit/copy/rewrite api.scan.js, call the JS scanner for results,
 * key results by test name, or drop failing cases. It is NOT the production
 * adapter.
 */

const { spawnSync } = require('child_process');
const Module = require('module');
const path = require('path');
const fs = require('fs');

// --- locate the scanprobe binary (built once via `cargo build --example scanprobe`)
const PROBE = path.join(
  __dirname,
  '..',
  'target',
  process.env.PMX_TARGET_DIR || 'debug',
  'examples',
  process.platform === 'win32' ? 'scanprobe.exe' : 'scanprobe'
);

if (!fs.existsSync(PROBE)) {
  throw new Error(
    '[scan-bridge] scanprobe binary not found at ' +
      PROBE +
      '. Run `cargo build --example scanprobe` in Rust/ first.'
  );
}

// --- resolve the scan module path exactly as the test file would
const testFile = path.join(__dirname, '..', '..', 'Main', 'test', 'api.scan.js');
const scanPath = Module._resolveFilename
  ? Module._resolveFilename('../lib/scan', {
      id: testFile,
      filename: testFile,
      paths: Module._nodeModulePaths(path.dirname(testFile)),
    })
  : path.join(__dirname, '..', '..', 'Main', 'lib', 'scan.js');

// --- decode helpers (inverse of scanprobe's enc_*)
function decStr(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && Array.isArray(v.__u16)) {
    return String.fromCharCode.apply(null, v.__u16);
  }
  return '';
}

function decNum(v) {
  if (v && typeof v === 'object' && typeof v.__num === 'string') {
    return Number(v.__num);
  }
  return typeof v === 'number' ? v : undefined;
}

function decToken(t) {
  const tok = { value: decStr(t.value), isGlob: t.isGlob === true };
  if (t.depth !== undefined && t.depth !== null) {
    tok.depth = decNum(t.depth);
  }
  // Conditional fields — only present when === true (mirrors JS)
  if (t.backslashes === true) tok.backslashes = true;
  if (t.isBrace === true) tok.isBrace = true;
  if (t.isBracket === true) tok.isBracket = true;
  if (t.isExtglob === true) tok.isExtglob = true;
  if (t.isGlobstar === true) tok.isGlobstar = true;
  if (t.negated === true) tok.negated = true;
  if (t.isPrefix === true) tok.isPrefix = true;
  return tok;
}

function decState(s) {
  const state = {
    prefix: decStr(s.prefix),
    input: decStr(s.input),
    start: s.start,
    base: decStr(s.base),
    glob: decStr(s.glob),
    isBrace: s.isBrace === true,
    isBracket: s.isBracket === true,
    isGlob: s.isGlob === true,
    isExtglob: s.isExtglob === true,
    isGlobstar: s.isGlobstar === true,
    negated: s.negated === true,
    negatedExtglob: s.negatedExtglob === true,
  };
  // Conditional fields — present ONLY when the Rust side emitted them
  // (i.e. when the JS scanner would have set them).
  if (s.tokens !== undefined && s.tokens !== null) {
    state.tokens = s.tokens.map(decToken);
  }
  if (s.maxDepth !== undefined && s.maxDepth !== null) {
    state.maxDepth = decNum(s.maxDepth);
  }
  if (s.slashes !== undefined && s.slashes !== null) {
    state.slashes = s.slashes.map(Number);
  }
  if (s.parts !== undefined && s.parts !== null) {
    state.parts = s.parts.map(decStr);
  }
  return state;
}

// --- the bridge scan function
function scan(input, options) {
  const opts = options || {};
  // Encode input: ASCII -> plain string (cheaper), else __u16 (matches canon.js)
  let encInput = input;
  let isAscii = true;
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 0x7f) {
      isAscii = false;
      break;
    }
  }
  if (!isAscii) {
    encInput = {
      __u16: Array.from({ length: input.length }, function (_, i) {
        return input.charCodeAt(i);
      }),
    };
  }
  const line = JSON.stringify({ i: 0, input: encInput, options: opts }) + '\n';

  const res = spawnSync(PROBE, [], {
    input: line,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(
      '[scan-bridge] scanprobe exited ' +
        res.status +
        ': ' +
        (res.stderr || '(no stderr)')
    );
  }
  const lines = res.stdout.split(/\r?\n/).filter(function (l) {
    return l.trim();
  });
  if (lines.length === 0) {
    throw new Error('[scan-bridge] scanprobe produced no output');
  }
  const row = JSON.parse(lines[lines.length - 1]);
  if (row.probeError) {
    throw new Error('[scan-bridge] scanprobe error: ' + row.probeError);
  }
  if (row.kind !== 'ok') {
    throw new Error('[scan-bridge] unexpected kind ' + row.kind);
  }
  return decState(row.state);
}

// --- inject into the CommonJS require cache
const fakeModule = new Module(scanPath, module);
fakeModule.filename = scanPath;
fakeModule.loaded = true;
fakeModule.exports = scan;
require.cache[scanPath] = fakeModule;

// Diagnostic (only on first load)
process.stderr.write(
  "[scan-bridge] intercepting require('" + scanPath + "') -> Rust scanprobe at " + PROBE + '\n'
);