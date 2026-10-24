# Definition of Done — estima

Four distinct states: **Implemented** (the agreed change exists), **Verified** (relevant automated and real-scenario checks are evidenced), **Accepted** (independent blocking findings addressed and requirements signed off), and **Released** (deployment/publication separately verified). Do not collapse them into a generic “done”.

## Criteria
- Outcome and explicit acceptance criteria documented; no unrelated modifications or silently reduced scope.
- Preserve architecture and compatibility contracts; report migration, API, security, localization and operational impacts.
- Applicable lint/typecheck/build/unit/integration/E2E executed with exact outcome; use N/A only with a reason, not as a substitute for a failed check.
- Tenant authorization including cross-user reads/writes, clarification atomicity and concurrent retry (#10), refresh JWT lifecycle, migration chains/rollback strategy, estimation/calibration, full-stack E2E.
- Independent reviewer checks the base-to-head diff against requirements, not just the author's summary; record reviewer identity, reviewed head SHA and disposition of findings. Reassess material changes after review. An AI assessment does not constitute an authorized GitHub approval; blocking findings must be fixed and retested.
- Docs, examples, UI states and release limitations match actual behavior.
- Fresh and upgrade migration smoke, disposable DB, API/web real flow, secrets and deployment/rollback must be proven before release. Current default branch is develop; do not presume main.

See [review policy](REVIEW_POLICY.md) and [release checklist](RELEASE_CHECKLIST.md). Runtime tests are not mandatory for docs-only changes when genuinely irrelevant, but links and command references still require inspection.
