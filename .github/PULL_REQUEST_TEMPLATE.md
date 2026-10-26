## Purpose and scope
- Linked issue:
- Acceptance criteria:
- Changes made:
- Out of scope:

## Project-specific checks
- [ ] Record exact commands for format/lint/typecheck/tests/build and relevant browser or integration tests.
- [ ] For tenant/auth/mutation changes, include negative cross-tenant and authorization cases and verify atomic update/delete behavior.
- [ ] For schema changes, describe migration compatibility and validation against disposable PostgreSQL; never use production credentials.

## Verification evidence
Record commands and results (do not check a box for an unrun command).
- [ ] Formatting / lint
- [ ] Typecheck (if applicable)
- [ ] Unit / integration tests
- [ ] Build (if applicable)
- [ ] Smoke / end-to-end tests (if applicable)
- [ ] Negative / failure-path regression tests (if applicable)

CI run links and known failures:

## Risk, documentation and release
- Security / authorization / secrets / data impact:
- Documentation and migration changes:
- Rollback or recovery plan (if applicable):
- Unresolved risks / blockers:


## Estima tenant, mutation and migration gates
- [ ] For authorization changes, negative cross-tenant/cross-user read and write cases are covered.
- [ ] For mutation changes, UPDATE/DELETE and clarification writes preserve atomicity; concurrent retry behavior tested where relevant.
- [ ] For schema changes, migration chain, fresh install, upgrade and rollback behavior are verified against disposable PostgreSQL; never use production credentials.
- [ ] JWT refresh lifecycle and relevant API/web E2E are covered when affected.
- [ ] Record the exact commands supported by the current `develop` target branch and actual outcomes; do not mark unrun checks as passing.

## Merge gate
- [ ] Required checks passed
- [ ] Independent review obtained (not author self-review)
- [ ] Blocking findings resolved

Do not merge while any required gate is missing.
