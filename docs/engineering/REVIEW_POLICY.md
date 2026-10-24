# Independent code review — estima

Reviewer must independently inspect task acceptance criteria, original diff, relevant code, tests, configuration, and security/product policies. A different agent/model can provide an independent technical assessment, but it is not deterministic testing or an authorized GitHub approval. Record the reviewer's identity, base and head SHA, and the evidence examined. Reassess the review after material changes to the head commit.

Priorities: (1) user-visible behavior and data correctness; (2) security/privacy/permissions; (3) regression and migration/API compatibility; (4) ineffective tests, missing boundary cases or mock-only evidence; (5) scope, duplication and maintenance.

Project-specific focus: Tenant authorization including cross-user reads/writes, clarification atomicity and concurrent retry (#10), refresh JWT lifecycle, migration chains/rollback strategy, estimation/calibration, full-stack E2E.

Findings must include severity, file/line or relevant change, concrete failure scenario or uncertainty, and actionable fix/test. High-risk correctness or security findings block acceptance. Medium findings need written disposition and follow-up. Do not claim that a passing CI, visual screenshot or reviewer opinion proves the whole product is ready.

Only approved maintainers merge and authorize releases. Reviewers do not silently rewrite the author branch.
