# audits/ — Session Audit Files

## Rules

1. **One AI chat/session = one audit file.** A session researches or reviews its single assigned scope; it must not silently combine unrelated implementation objectives.
2. **Never append to an old audit.** New session → new file, even for continuing work.
3. **Naming:** `YYYY-MM-DD-HHMM-<scope>.md` (24h, session-local time; example: `2026-07-31-0134-bootstrap-research.md`).
4. The audit is written BY the primary agent from produced files, repository evidence, and command logs — not hidden reasoning.

## Required contents

- assignment and scope;
- initial and final Git state (branch, HEAD, `git status --short`, `git diff --stat` before push);
- sources and files inspected;
- files created/changed;
- commands and exact outcomes (with exit codes);
- claims verified vs assumed;
- adversarial review findings by severity (`critical`, `high`, `medium`, `low`, `note`) with dispositions;
- fixes made and residual risks;
- contradictions or inaccessible evidence;
- the next session's single recommended assignment.

## Index

| File | Session | Scope | Outcome |
|---|---|---|---|
| `2026-07-31-0134-bootstrap-research.md` | bootstrap | research + scaffolding (no port code) | superseded in part — its F-01/F-04/F-05 residuals (stale "38 files", lint regression, 4-file encoding corruption) were found by the readiness review; treat its "fixed" dispositions as re-verified only via the two audits below |
| `2026-07-31-1819-bootstrap-readiness-review.md` | readiness review | independent evidence-only audit of the bootstrap | READY WITH CONDITIONS; 20 findings (F-01..F-20); start gate: Phase 0 only |
| `2026-07-31-1935-phase0-remediation.md` | phase 0 remediation | close all 20 findings; Phase 0 completion; Phase 1 readiness | PHASE 1 READY |
| `2026-08-01-0015-final-phase1-readiness.md` | final pre-Phase-1 readiness | full repo re-read, probe-verified adapter/parser designs, Phase 1 coverage standard | READY TO START PHASE 1 |

Audit-disposition rule (added 2026-07-31): a finding may be marked closed only after its validation command/check has been re-run on the FINAL checkout of the session ("re-run closure validation on final checkout").
