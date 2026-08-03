#!/usr/bin/env node
'use strict';

// Standalone artifact verifier — independently re-verifies FINAL benchmark
// evidence:
//   1. selects the final artifact set (schema_version 2, config.mode "final");
//      legacy v1 artifacts are reported as superseded, never accepted as final;
//   2. recomputes every SHA-256 sidecar from disk (raw, summary, schedule);
//   3. validates the raw artifact with FULL expectations derived from the
//      run's own config + the referenced scenario corpus + the seeded
//      schedule (re-derived, not trusted);
//   4. checks the harness commit exists and is HEAD or an ancestor of HEAD;
//   5. independently RECOMPUTES every summary row from the raw measurements
//      (shared stats.js implementation, deterministic seed) and requires an
//      exact match — a summary from another run or hand-edited fails;
//   6. when the benchmark binaries exist locally, recomputes their hashes.
//
// Usage: node benchmarks/verify-artifacts.js <results-dir>

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { spawnSync } = require('child_process');
const { ErrorCodes, validateRaw, validateSummary } = require('./validator');
const { analyzeScenario } = require('./stats');
const { mulberry32 } = require('./prng');

const ROOT = path.join(__dirname, '..');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function summaryRowsMatch(a, b) {
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number') {
    return Math.abs(a - b) <= 1e-8 || (Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))) <= 1e-8;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => summaryRowsMatch(v, b[i]));
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return false;
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k, i) => k === keysB[i] && summaryRowsMatch(a[k], b[k]));
  }
  return a === b;
}

function main() {
  const resultsDir = process.argv[2];
  if (!resultsDir) {
    console.error('Usage: node verify-artifacts.js <results-dir>');
    process.exit(1);
  }
  if (process.argv.length > 3) {
    console.error('Usage: node verify-artifacts.js <results-dir> (unexpected extra arguments)');
    process.exit(1);
  }

  const files = fs.readdirSync(resultsDir);
  const rawFiles = files.filter(f => f.endsWith('-raw.json'));
  const summaryFiles = files.filter(f => f.endsWith('-summary.json'));
  const scheduleFiles = files.filter(f => f.endsWith('-schedule.json'));
  const errors = [];
  const legacy = [];

  // --- classify artifacts: final (v2 + mode "final") vs non-final ---
  // Non-final includes: mode "pilot", mode "full" (complete but unbound),
  // and legacy schema v1 artifacts (superseded pre-H2 evidence).
  const finals = [];
  for (const f of rawFiles) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8'));
    } catch (e) {
      errors.push(f + ' [MALFORMED_RAW] failed to read or parse raw artifact: ' + e.message);
      legacy.push(f + ' (unreadable/malformed — skipped)');
      continue;
    }
    if (raw.schema_version === 2 && raw.config && raw.config.mode === 'final') {
      const base = f.replace(/-raw\.json$/, '');
      finals.push({ base, raw });
    } else if (raw.schema_version === 2 && raw.config && (raw.config.mode === 'pilot' || raw.config.mode === 'full')) {
      legacy.push(f + ' (mode "' + raw.config.mode + '" — not final evidence)');
    } else {
      legacy.push(f + ' (schema ' + (raw.schema_version || '?') + ', superseded — not final evidence)');
    }
  }
  for (const f of legacy) {
    console.log('SKIP legacy artifact: ' + f);
  }
  if (finals.length === 0) {
    console.error('VERIFICATION FAILED:');
    console.error('  no final artifact set found (schema_version 2, mode "final").');
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }
  if (finals.length > 1) {
    errors.push('multiple final raw artifacts present: ' + finals.map(x => x.base).join(', ') + ' — exactly one final set is allowed');
  }

  for (const { base, raw } of finals) {
    const rawPath = path.join(resultsDir, base + '-raw.json');
    const summaryPath = path.join(resultsDir, base + '-summary.json');
    const schedulePath = path.join(resultsDir, base + '-schedule.json');

    // --- validate provenance BEFORE use (trust boundary) ---
    // Missing/malformed provenance, an escaping corpus path, or a malformed
    // harness SHA must produce validation errors, not crashes or silent use.
    const provErrors = [];
    const prov = (raw.provenance && typeof raw.provenance === 'object') ? raw.provenance : {};
    if (!raw.provenance || typeof raw.provenance !== 'object') {
      provErrors.push('missing or malformed provenance object');
    }
    if (typeof prov.schedule_sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(prov.schedule_sha256)) {
      provErrors.push('malformed provenance.schedule_sha256');
    }
    if (!Array.isArray(prov.schedule)) {
      provErrors.push('malformed provenance.schedule (not an array)');
    }
    if (typeof prov.harness_sha !== 'string' || !/^[0-9a-f]{40}$/i.test(prov.harness_sha)) {
      provErrors.push('malformed provenance.harness_sha (expected 40 hex chars)');
    }
    let corpusPath = null;
    if (typeof prov.corpus_path !== 'string' || prov.corpus_path.length === 0) {
      provErrors.push('malformed provenance.corpus_path');
    } else {
      // Normalize both slash styles (Windows-generated artifacts stay
      // readable on POSIX) and confine the resolved path beneath ROOT.
      const normalized = prov.corpus_path.replace(/\\/g, '/');
      const resolved = path.resolve(ROOT, normalized);
      if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
        provErrors.push('corpus_path escapes the repository root: ' + prov.corpus_path);
      } else {
        corpusPath = resolved;
      }
    }
    if (provErrors.length > 0) {
      for (const e of provErrors) errors.push(base + ' [MISSING_PROVENANCE] ' + e);
      continue;
    }

    // --- sidecars ---
    for (const p of [rawPath, summaryPath]) {
      const sidecar = p + '.sha256';
      if (!fs.existsSync(sidecar)) {
        errors.push('Missing sidecar: ' + sidecar);
        continue;
      }
      const expected = fs.readFileSync(sidecar, 'utf8').trim();
      const actual = sha256(fs.readFileSync(p));
      if (expected !== actual) {
        errors.push('Hash mismatch for ' + path.basename(p) + ': expected ' + expected + ', got ' + actual);
      }
    }

    // --- summary belongs to this run ---
    if (!fs.existsSync(summaryPath)) {
      errors.push('Missing summary for final set: ' + summaryPath);
      continue;
    }
    let summary = null;
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    } catch (e) {
      errors.push(base + ' [MALFORMED_SUMMARY] failed to read or parse summary: ' + e.message);
    }

    // --- schedule file binds to embedded schedule hash ---
    if (!fs.existsSync(schedulePath)) {
      errors.push('Missing schedule file: ' + schedulePath);
    } else {
      try {
        const schedSha = sha256(fs.readFileSync(schedulePath));
        if (schedSha !== prov.schedule_sha256) {
          errors.push('Schedule file hash ' + schedSha + ' != embedded schedule_sha256 ' + prov.schedule_sha256);
        }
        const onDisk = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
        if (JSON.stringify(onDisk) !== JSON.stringify(prov.schedule)) {
          errors.push('Schedule file entries differ from embedded provenance.schedule');
        }
      } catch (e) {
        errors.push(base + ' [MALFORMED_SCHEDULE] failed to read or parse schedule file: ' + e.message);
      }
    }

    // --- derive expectations independently ---
    const cfg = raw.config || {};
    let corpusSha = null;
    let scenarioIds = [];
    let scenarioDocs = [];
    try {
      const stat = fs.statSync(corpusPath);
      if (!stat.isFile()) {
        errors.push(base + ' [MALFORMED_CORPUS] corpus_path is not a file: ' + corpusPath);
      } else {
        // Read and hash the corpus file, then parse it — all within the
        // same try/catch so EISDIR, EACCES, or invalid JSON all produce
        // a structured error instead of an uncaught exception.
        const corpusBuf = fs.readFileSync(corpusPath);
        corpusSha = sha256(corpusBuf);
        scenarioDocs = JSON.parse(corpusBuf.toString('utf8'));
        if (!Array.isArray(scenarioDocs)) {
          errors.push(base + ' [MALFORMED_CORPUS] corpus file does not contain a JSON array: ' + corpusPath);
          scenarioDocs = [];
        } else {
          scenarioIds = scenarioDocs.map(s => s.id);
        }
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        errors.push('Referenced corpus not found: ' + corpusPath);
      } else {
        errors.push(base + ' [MALFORMED_CORPUS] failed to read or parse corpus file: ' + e.message);
      }
    }
    // Re-derive the seeded schedule rather than trusting the embedded one.
    const rng = mulberry32(cfg.seed >>> 0);
    const derivedSchedule = [];
    for (let p = 0; p < cfg.pairs; p++) {
      derivedSchedule.push({ pair_id: p, rust_first: rng() < 0.5 });
    }

    const rawErrors = validateRaw(raw, {
      scenarios: scenarioIds,
      pairs: cfg.pairs,
      itersPerSample: cfg.iters_per_sample,
      samples: cfg.samples,
      warmupIters: cfg.warmup_iters,
      seed: cfg.seed,
      corpusSha: corpusSha,
      harnessSha: prov.harness_sha, // presence/consistency checked below
      dirtyTree: false,
      mode: 'final',
      schedule: derivedSchedule,
    });
    for (const e of rawErrors) errors.push(base + ' [' + e.code + '] ' + e.message);

    // If structural validation of the raw artifact failed (missing/malformed
    // measurements, missing runtimes, missing results arrays), the raw data
    // is NOT safe to pass to analyzeScenario — it dereferences m.js.results
    // and m.rust.results unconditionally. Skip summary recomputation for this
    // artifact and continue collecting/reporting validation errors.
    const hasStructuralErrors = rawErrors.some(e =>
      e.code === ErrorCodes.MALFORMED_MEASUREMENT ||
      e.code === ErrorCodes.MISSING_PAIR ||
      e.code === ErrorCodes.MISSING_RUNTIME ||
      e.code === ErrorCodes.WRONG_PROCESS_COUNT
    );

    // --- harness commit exists and is HEAD or an ancestor of HEAD ---
    const catFile = spawnSync('git', ['cat-file', '-t', prov.harness_sha], { cwd: ROOT, encoding: 'utf8' });
    if (catFile.status !== 0 || catFile.stdout.trim() !== 'commit') {
      errors.push('harness_sha ' + prov.harness_sha + ' is not a commit in this repository');
    } else {
      const anc = spawnSync('git', ['merge-base', '--is-ancestor', prov.harness_sha, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
      if (anc.status !== 0) {
        errors.push('harness_sha ' + prov.harness_sha + ' is not HEAD or an ancestor of HEAD');
      }
    }

    // --- summary validation with full expectations ---
    const summaryErrors = validateSummary(summary, {
      scenarios: scenarioIds,
      config: raw.config,
      provenance: raw.provenance,
    });
    for (const e of summaryErrors) errors.push(base + ' [' + e.code + '] ' + e.message);

    // --- independent recomputation of every summary row from raw ---
    // Skip recomputation when structural validation failed: analyzeScenario
    // dereferences m.js.results / m.rust.results and will crash on malformed
    // measurements. Also skip when the summary itself failed to parse.
    if (hasStructuralErrors) {
      errors.push(base + ' [SKIP_RECOMPUTE] summary recomputation skipped due to structural raw validation errors');
    } else if (!summary || !Array.isArray(summary.scenarios)) {
      errors.push(base + ' [SKIP_RECOMPUTE] summary is null or has no scenarios array — cannot recompute');
    } else {
      for (const scenario of scenarioDocs) {
        let recomputed;
        try {
          recomputed = analyzeScenario(
            scenario,
            scenarioIds.indexOf(scenario.id),
            raw.measurements,
            cfg.iters_per_sample,
            cfg.seed,
            cfg.bootstrap_resamples
          );
        } catch (e) {
          errors.push(base + ' [RECOMPUTE_CRASH] scenario ' + scenario.id + ' threw during recomputation: ' + e.message);
          continue;
        }
        const committed = summary.scenarios.find(s => s.scenario_id === scenario.id);
        if (!committed) {
          errors.push(base + ' summary missing scenario row: ' + scenario.id);
          continue;
        }
        if (!summaryRowsMatch(committed, recomputed)) {
          errors.push(base + ' summary row for ' + scenario.id + ' does not recompute from raw (altered or from another run)');
        }
      }
    }

    // --- binary hashes (when binaries exist locally) ---
    const ext = process.platform === 'win32' ? '.exe' : '';
    for (const [name, key] of [['scanbench', 'scanbench_sha256'], ['scanprobe', 'scanprobe_sha256']]) {
      const binPath = path.join(ROOT, 'target', 'release', 'examples', name + ext);
      if (fs.existsSync(binPath)) {
        const actual = sha256(fs.readFileSync(binPath));
        if (actual !== prov[key]) {
          errors.push('Local ' + name + ' binary hash differs from provenance ' + key + ' (binary not rebuilt from the harness commit, or provenance forged)');
        }
      } else {
        console.log('NOTE: ' + name + ' binary not present locally; hash binding recorded but not recomputed.');
      }
    }
  }

  // --- every summary/schedule file on disk must belong to a final or legacy set ---
  for (const f of summaryFiles) {
    const base = f.replace(/-summary\.json$/, '');
    const isFinal = finals.some(x => x.base === base);
    const isLegacyRaw = rawFiles.includes(base + '-raw.json');
    if (!isFinal && !isLegacyRaw) {
      errors.push('Orphan summary artifact: ' + f);
    }
  }
  for (const f of scheduleFiles) {
    const base = f.replace(/-schedule\.json$/, '');
    const isFinal = finals.some(x => x.base === base);
    const isLegacyRaw = rawFiles.includes(base + '-raw.json');
    if (!isFinal && !isLegacyRaw && f !== 'execution-schedule.json') {
      errors.push('Orphan schedule artifact: ' + f);
    }
  }

  if (errors.length > 0) {
    console.error('VERIFICATION FAILED:');
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }
  console.log('All final artifacts verified (' + finals.length + ' final set' + (finals.length === 1 ? '' : 's') +
    ': raw + summary + schedule + sidecars + independent summary recomputation' +
    (legacy.length ? '; ' + legacy.length + ' legacy set(s) skipped as superseded' : '') + ').');
}

main();
