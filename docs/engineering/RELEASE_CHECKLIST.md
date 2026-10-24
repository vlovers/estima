# Release checklist — estima

This is a process gate, not release authorization.

- [ ] Confirm current release baseline, exact candidate SHA, live open PR/issues and critical defects.
- [ ] Record what is implemented versus verified, accepted and shipped; ensure docs match release scope.
- [ ] Run applicable clean install, static checks, unit/integration/E2E and build against exact candidate revision.
- [ ] Verify security, sensitive settings, third-party rights and dependency changes; collect independent review evidence.
- [ ] Tenant authorization including cross-user reads/writes, clarification atomicity and concurrent retry (#10), refresh JWT lifecycle, migration chains/rollback strategy, estimation/calibration, full-stack E2E.
- [ ] Fresh and upgrade migration smoke, disposable DB, API/web real flow, secrets and deployment/rollback must be proven before release. Current default branch is develop; do not presume main.
- [ ] Confirm environment-specific smoke checks and documented mitigation/rollback, with secrets excluded from logs.
- [ ] Obtain maintainer authorization before merge/deploy/package publishing.
- [ ] After release, verify real deployed origin or installed published artifact independently and record link/commit.

Never mark this checklist passed for commands not executed or evidence from a different SHA.
