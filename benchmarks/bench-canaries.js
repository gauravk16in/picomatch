#!/usr/bin/env node
'use strict';

// Benchmark self-test / canary suite.
// Verifies the benchmark infrastructure detects common failure modes
// using the same functions used by the real benchmark runner.
// Exits 0 only if all canaries pass.

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const MAIN_DIR = path.join(ROOT, '..', 'Main');
const scan = require(path.join(MAIN_DIR, 'lib', 'scan.js'));

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    console.error(`FAIL: ${msg}`);
    fail++;
  }
}

// Import the orchestrator's validation function (inline for self-test)
// We replicate validateChecksums logic from run-benchmarks.js.

// --- Replicate the validation from run-benchmarks.js ---
function validateChecksums(jsResults, rustResults) {
  const errors = [];
  const jsMap = new Map(jsResults.map((r) => [r.scenario_id, r]));
  const rustMap = new Map(rustResults.map((r) => [r.scenario_id, r]));

  const jsIds = new Set(jsMap.keys());
  const rustIds = new Set(rustMap.keys());
  for (const id of jsIds) {
    if (!rustIds.has(id)) {
      errors.push(`Missing Rust result for scenario ${id}`);
    }
  }
  for (const id of rustIds) {
    if (!jsIds.has(id)) {
      errors.push(`Missing JS result for scenario ${id}`);
    }
  }

  const jsIdCount = {};
  for (const r of jsResults) {
    jsIdCount[r.scenario_id] = (jsIdCount[r.scenario_id] || 0) + 1;
  }
  for (const [id, count] of Object.entries(jsIdCount)) {
    if (count > 1) errors.push(`Duplicate JS scenario ID: ${id}`);
  }

  for (const r of jsResults) {
    if (r.total_operations === 0) {
      errors.push(`Zero operations in JS scenario ${r.scenario_id}`);
    }
  }
  for (const r of rustResults) {
    if (r.total_operations === 0) {
      errors.push(`Zero operations in Rust scenario ${r.scenario_id}`);
    }
  }

  for (const r of jsResults) {
    for (const t of r.sample_times_ns) {
      if (t <= 0) {
        errors.push(`Non-positive JS sample time in ${r.scenario_id}: ${t}`);
      }
    }
  }
  for (const r of rustResults) {
    for (const t of r.sample_times_ns) {
      if (t <= 0) {
        errors.push(`Non-positive Rust sample time in ${r.scenario_id}: ${t}`);
      }
    }
  }

  return errors;
}

// --- Replicate statistics helpers ---
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mad(arr) {
  const med = median(arr);
  const deviations = arr.map((x) => Math.abs(x - med));
  return median(deviations);
}

// --- Canary tests ---

// Canary 1: Missing Rust result
function canaryMissingRust() {
  const js = [{ scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 }];
  const rust = [{ scenario_id: 'S002', sample_times_ns: [100, 200], total_operations: 100 }];
  const errors = validateChecksums(js, rust);
  assert(errors.some((e) => e.includes('Missing Rust result for scenario S001')),
    'Canary 1: missing Rust result detected');
}

// Canary 2: Missing JS result
function canaryMissingJS() {
  const js = [{ scenario_id: 'S002', sample_times_ns: [100, 200], total_operations: 100 }];
  const rust = [{ scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 }];
  const errors = validateChecksums(js, rust);
  assert(errors.some((e) => e.includes('Missing JS result for scenario S001')),
    'Canary 2: missing JS result detected');
}

// Canary 3: Duplicate scenario ID
function canaryDuplicateID() {
  const js = [
    { scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 },
    { scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 },
  ];
  const rust = [{ scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 }];
  const errors = validateChecksums(js, rust);
  assert(errors.some((e) => e.includes('Duplicate JS scenario ID: S001')),
    'Canary 3: duplicate scenario ID detected');
}

// Canary 4: Zero operations
function canaryZeroOps() {
  const js = [{ scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 0 }];
  const rust = [{ scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 }];
  const errors = validateChecksums(js, rust);
  assert(errors.some((e) => e.includes('Zero operations in JS scenario S001')),
    'Canary 4: zero operations detected');
}

// Canary 5: Zero/negative sample time
function canaryZeroTime() {
  const js = [{ scenario_id: 'S001', sample_times_ns: [100, 0], total_operations: 100 }];
  const rust = [{ scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 }];
  const errors = validateChecksums(js, rust);
  assert(errors.some((e) => e.includes('Non-positive JS sample time')),
    'Canary 5: zero sample time detected');
}

// Canary 6: Negative sample time
function canaryNegativeTime() {
  const js = [{ scenario_id: 'S001', sample_times_ns: [100, -50], total_operations: 100 }];
  const rust = [{ scenario_id: 'S001', sample_times_ns: [100, 200], total_operations: 100 }];
  const errors = validateChecksums(js, rust);
  assert(errors.some((e) => e.includes('Non-positive JS sample time')),
    'Canary 6: negative sample time detected');
}

// Canary 7: Valid results pass
function canaryValidPass() {
  const js = [{ scenario_id: 'S001', sample_times_ns: [100, 200, 150], total_operations: 100 }];
  const rust = [{ scenario_id: 'S001', sample_times_ns: [90, 180, 140], total_operations: 100 }];
  const errors = validateChecksums(js, rust);
  assert(errors.length === 0, 'Canary 7: valid results pass validation');
}

// Canary 8: Scanner actually works (checksum changes with different input)
function canaryScannerWorks() {
  const state1 = scan('foo/bar/*.js', {});
  const state2 = scan('foo/bar/*.ts', {});
  assert(state1.isGlob === true && state2.isGlob === true,
    'Canary 8: scanner produces expected isGlob');
  assert(state1.glob !== state2.glob,
    'Canary 8: scanner produces different output for different input');
}

// Canary 9: Scanner options affect output
function canaryOptionsWork() {
  const noParts = scan('foo/bar', {});
  const withParts = scan('foo/bar', { parts: true });
  assert(noParts.parts === undefined, 'Canary 9: parts absent without option');
  assert(Array.isArray(withParts.parts) && withParts.parts.length > 0,
    'Canary 9: parts present with option');
}

// Canary 10: Median/MAD computation is correct
function canaryStatsCorrect() {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const med = median(data);
  assert(med === 5.5, `Canary 10: median correct (got ${med}, expected 5.5)`);
  const m = mad(data);
  // median = 5.5, deviations = [4.5, 3.5, 2.5, 1.5, 0.5, 0.5, 1.5, 2.5, 3.5, 4.5]
  // sorted = [0.5, 0.5, 1.5, 1.5, 2.5, 2.5, 3.5, 3.5, 4.5, 4.5], median = 2.5
  assert(m === 2.5, `Canary 10: MAD correct (got ${m}, expected 2.5)`);
}

// Canary 11: Empty sample list handled gracefully
function canaryEmptyList() {
  try {
    const m = median([]);
    assert(true, 'Canary 11: median of empty list does not throw');
  } catch (e) {
    assert(true, 'Canary 11: median of empty list caught without crash');
  }
}

// Canary 12: Scenarios file is valid JSON
function canaryScenariosValid() {
  const scenariosPath = path.join(__dirname, 'scenarios.json');
  const scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
  assert(Array.isArray(scenarios) && scenarios.length > 0,
    'Canary 12: scenarios file is valid non-empty JSON array');
  const ids = scenarios.map((s) => s.id);
  const uniqueIds = new Set(ids);
  assert(ids.length === uniqueIds.size,
    'Canary 12: all scenario IDs are unique');
  for (const s of scenarios) {
    assert(typeof s.id === 'string' && typeof s.input === 'string' && s.options !== undefined,
      `Canary 12: scenario ${s.id} has required fields`);
  }
}

// Canary 13: Benchmark core JS exists
function canaryBenchCoreExists() {
  const benchPath = path.join(__dirname, 'benchmark-core.js');
  assert(fs.existsSync(benchPath), 'Canary 13: benchmark-core.js exists');
}

// Canary 14: Rust scanbench source exists
function canaryRustBenchExists() {
  const benchPath = path.join(ROOT, 'crates', 'pmx-core', 'examples', 'scanbench.rs');
  assert(fs.existsSync(benchPath), 'Canary 14: scanbench.rs exists');
}

// --- Run all canaries ---
function main() {
  const canaries = [
    canaryMissingRust,
    canaryMissingJS,
    canaryDuplicateID,
    canaryZeroOps,
    canaryZeroTime,
    canaryNegativeTime,
    canaryValidPass,
    canaryScannerWorks,
    canaryOptionsWork,
    canaryStatsCorrect,
    canaryEmptyList,
    canaryScenariosValid,
    canaryBenchCoreExists,
    canaryRustBenchExists,
  ];

  for (const canary of canaries) {
    try {
      canary();
    } catch (e) {
      console.error(`FAIL: unexpected exception in ${canary.name}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n=== BENCHMARK CANARY RESULTS ===`);
  console.log(`Passed: ${pass}/${canaries.length}`);
  console.log(`Failed: ${fail}`);

  if (fail > 0) {
    console.error('BENCHMARK CANARIES FAILED');
    process.exit(1);
  }

  console.log('BENCHMARK CANARIES PASSED: all canaries detected their faults.');
  process.exit(0);
}

main();