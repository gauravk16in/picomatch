| module | reviewed_at | verdict | findings_open |
|---|---|---|---|
| C0 | 2026-08-01 | REJECT | 1 BLOCKER (globstar fragment parens), 2 MAJOR (f64-Display message bytes; canon.js astral encoder corrupts corpus), 3 MINOR (I-1 struct delta, I-8 missing, as-casts) |
| C0 | 2026-08-01 | ACCEPT (iter 2) | 1 MAJOR (serde_json f64 decode in JSON transports is not correctly rounded — harness fixed review-side, 5000/5000 re-attack clean; implementer owes DECISIONS.md entry for §4b adapter), 4 MINOR (I-1 delta undeclared, windows globstar byte-pins missing, stale corpus-sha comment, workspace not a git repo) |
| C1 | 2026-08-01 | ACCEPT | 0 BLOCKER, 0 MAJOR, 0 MINOR |
| C2 | 2026-08-01 | ACCEPT | 0 BLOCKER, 0 MAJOR, 0 MINOR |

