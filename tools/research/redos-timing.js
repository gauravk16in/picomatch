'use strict';
// DISPOSABLE RESEARCH HARNESS (tools/research/) — not part of the port.
// Bounded issue-#175 timing probe for '+(ab|abab)' (see docs/security.md F-17 protocol).
// Safety: conservative input lengths only (n <= 35, ~165 ms worst observed); a hard
// length cap is enforced here so the harness can never hang the machine. Larger
// lengths belong to the Phase 9 worker-thread timeout protocol (docs/security.md).
const pm = require('../..');

const PATTERN = '+(ab|abab)';
const MAX_N = 35; // hard cap: do not raise outside the Phase 9 protocol
const lengths = [20, 24, 28, 30, 32, 34, MAX_N];
const REPS = 5;

const re = pm.makeRe(PATTERN);
const out = {
  pattern: PATTERN,
  compiledSource: re.source,
  literalized: re.source.includes('\\+('),
  inputGenerator: "'ab'.repeat(n) + 'c' (near-miss, forces backtracking; matches issue #175 PoC)",
  reps: REPS,
  hardCapN: MAX_N,
  runs: [],
  env: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: (require('os').cpus()[0] || {}).model || 'unknown',
    cores: (require('os').cpus() || []).length
  }
};

for (const n of lengths) {
  if (n > MAX_N) throw new Error('length cap exceeded');
  const input = 'ab'.repeat(n) + 'c';
  const times = [];
  for (let r = 0; r < REPS; r++) {
    const t0 = process.hrtime.bigint();
    re.test(input);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  out.runs.push({
    n,
    inputLength: input.length,
    medianMs: times[Math.floor(REPS / 2)],
    minMs: times[0],
    maxMs: times[REPS - 1]
  });
}

console.log(JSON.stringify(out, null, 2));
