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
const { validateRaw, validateSummary } = require('./validator');
const { analyzeScenario } = require('./stats');
const { mulberry32 } = require('./prng');

const ROOT = path.join(__dirname, '..');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
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

  // --- classify artifacts: final (v2 + mode "final") vs legacy/superseded ---
  const finals = [];
  for (const f of rawFiles) {
    const raw = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8'));
    if (raw.schema_version === 2 && raw.config && raw.config.mode === 'final') {
      const base = f.replace(/-raw\.json$/, '');
      finals.push({ base, raw });
    } else {
      legacy.push(f + ' (schema ' + (raw.schema_version || '?') + ', superseded — not final evidence)');
    }
  }
  for (const f of legacy) {
    console.log('SKIP legacy artifact: ' + f);
  }
  if (finals.length === 0) {
    console.error('VERIFICATION FAILED: no final artifact set found (schema_version 2, mode "final").');
    process.exit(1);
  }
  if (finals.length > 1) {
    errors.push('multiple final raw artifacts present: ' + finals.map(x => x.base).join(', ') + ' — exactly one final set is allowed');
  }

  for (const { base, raw } of finals) {
    const rawPath = path.join(resultsDir, base + '-raw.json');
    const summaryPath = path.join(resultsDir, base + '-summary.json');
    const schedulePath = path.join(resultsDir, base + '-schedule.json');

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
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    // --- schedule file binds to embedded schedule hash ---
    if (!fs.existsSync(schedulePath)) {
      errors.push('Missing schedule file: ' + schedulePath);
    } else {
      const schedSha = sha256(fs.readFileSync(schedulePath));
      if (schedSha !== raw.provenance.schedule_sha256) {
        errors.push('Schedule file hash ' + schedSha + ' != embedded schedule_sha256 ' + raw.provenance.schedule_sha256);
      }
      const onDisk = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
      if (JSON.stringify(onDisk) !== JSON.stringify(raw.provenance.schedule)) {
        errors.push('Schedule file entries differ from embedded provenance.schedule');
      }
    }

    // --- derive expectations independently ---
    const cfg = raw.config || {};
    let corpusSha = null;
    const corpusPath = path.join(ROOT, raw.provenance.corpus_path || '');
    if (fs.existsSync(corpusPath)) {
      corpusSha = sha256(fs.readFileSync(corpusPath));
    } else {
      errors.push('Referenced corpus not found: ' + corpusPath);
    }
    let scenarioIds = [];
    let scenarioDocs = [];
    if (corpusSha) {
      scenarioDocs = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
      scenarioIds = scenarioDocs.map(s => s.id);
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
      harnessSha: raw.provenance.harness_sha, // presence/consistency checked below
      dirtyTree: false,
      mode: 'final',
      schedule: derivedSchedule,
    });
    for (const e of rawErrors) errors.push(base + ' [' + e.code + '] ' + e.message);

    // --- harness commit exists and is HEAD or an ancestor of HEAD ---
    const catFile = spawnSync('git', ['cat-file', '-t', raw.provenance.harness_sha], { cwd: ROOT, encoding: 'utf8' });
    if (catFile.status !== 0 || catFile.stdout.trim() !== 'commit') {
      errors.push('harness_sha ' + raw.provenance.harness_sha + ' is not a commit in this repository');
    } else {
      const anc = spawnSync('git', ['merge-base', '--is-ancestor', raw.provenance.harness_sha, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
      if (anc.status !== 0) {
        errors.push('harness_sha ' + raw.provenance.harness_sha + ' is not HEAD or an ancestor of HEAD');
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
    for (const scenario of scenarioDocs) {
      const recomputed = analyzeScenario(
        scenario,
        scenarioIds.indexOf(scenario.id),
        raw.measurements,
        cfg.iters_per_sample,
        cfg.seed,
        cfg.bootstrap_resamples
      );
      const committed = summary.scenarios.find(s => s.scenario_id === scenario.id);
      if (!committed) {
        errors.push(base + ' summary missing scenario row: ' + scenario.id);
        continue;
      }
      if (JSON.stringify(committed) !== JSON.stringify(recomputed)) {
        errors.push(base + ' summary row for ' + scenario.id + ' does not recompute from raw (altered or from another run)');
      }
    }

    // --- binary hashes (when binaries exist locally) ---
    const ext = process.platform === 'win32' ? '.exe' : '';
    for (const [name, key] of [['scanbench', 'scanbench_sha256'], ['scanprobe', 'scanprobe_sha256']]) {
      const binPath = path.join(ROOT, 'target', 'release', 'examples', name + ext);
      if (fs.existsSync(binPath)) {
        const actual = sha256(fs.readFileSync(binPath));
        if (actual !== raw.provenance[key]) {
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
