## Purpose and scope
- Linked issue:
- Acceptance criteria:
- Changes made:
- Out of scope:

## Project-specific checks
- [ ] Record exact commands for format/lint/typecheck/tests/build and relevant browser or integration tests.
- [ ] For tenant/auth/mutation changes, include negative cross-tenant and authorization cases and verify atomic update/delete behavior.
- [ ] For schema changes, describe migration compatibility and validation against disposable PostgreSQL; never use production credentials.

## Multi-agent coordination
- Parent issue, batch owner, reviewer, integration owner:
- Existing/superseded PRs and dependency order:
- Owned paths and shared tenant/auth/API/migration contracts:
- Target branch and exact base/head SHAs:
- [ ] Coherent end-to-end outcome with tests, not artificial micro-PRs
- [ ] Conflicts and shared contract ownership resolved without overwriting another agent
- [ ] Verification and review reflect final head and integration base

See [multi-agent workflow](../docs/engineering/MULTI_AGENT_WORKFLOW.md).

## Verification evidence
Record commands and results (do not check a box for an unrun command).

| Check | PASS / FAIL / N/A / NOT RUN | Exact command, run link, environment, reason |
| --- | --- | --- |
| Static / lint / types | | |
| Unit / integration | | |
| API/web build | | |
| Product / browser E2E | | |
| Security / tenant isolation / migrations / third-party rights | | |

Distinguish actual results from proposed checks; disclose unsupported behavior and incomplete coverage.
- [ ] Formatting / lint
- [ ] Typecheck (if applicable)
- [ ] Unit / integration tests
- [ ] Build (if applicable)
- [ ] Smoke / end-to-end tests (if applicable)
- [ ] Negative / failure-path regression tests (if applicable)

CI run links and known failures:

## User experience, AI data and operational safety
- User-facing flow, accessibility, loading/empty/error states, and browser/device coverage (or N/A with reason):
- AI-assisted input/output safety: prompt-injection and untrusted-content handling, sensitive-data exposure, logging/redaction and model-output validation (or N/A):
- Authentication, authorization and cross-tenant read/write exposure, including negative cases (or N/A):
- Migration forward/backward compatibility, fresh-install/upgrade evidence, rollback feasibility and disposable PostgreSQL environment (or N/A):
- Data compatibility, concurrent writes/retries, token refresh and operational monitoring implications (or N/A):
- Secrets, customer data, private configuration and sensitive reports excluded from PR description, fixtures and CI logs:
- Security disclosure: never publish exploit details or credentials in public PR/Issues; follow the repository SECURITY.md policy when present.

## Independent review and acceptance evidence
- Reviewer distinct from author, reviewed exact head SHA, date and evidence:
- Findings by severity, concrete failure scenario, disposition and regression evidence:
- Material changes after review and re-review required:
- Maintainer acceptance / merge authorization: **not implied by green CI or AI review**.

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

See [Definition of Done](../docs/engineering/DEFINITION_OF_DONE.md), [independent review policy](../docs/engineering/REVIEW_POLICY.md), and [release checklist](../docs/engineering/RELEASE_CHECKLIST.md).

## Merge gate
- [ ] Required checks passed
- [ ] Independent review obtained (not author self-review)
- [ ] Blocking findings resolved

Do not merge while any required gate is missing.
