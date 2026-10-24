# AI engineering contract — estima

Read README.md and existing engineering/product policies before changes. README.md, api/src/database/data-source.ts, api/jest.integration.config.ts and package.json are relevant source files; inspect the migration scripts and active migration chain before modifying persistence.

## Product boundaries
Multi-tenant React/NestJS/TypeORM/PostgreSQL estimates application. Never leak cross-tenant information, accept non-atomic partial clarification writes, or alter migrations destructively. Confirm actual Nx/Bun scripts before running.

## Agent workflow
1. Discover the current branch, code, PR/issue queue and existing tests; never assume a previously claimed implementation exists.
2. Plan a cohesive user-visible delivery with acceptance criteria, contracts, non-goals, risk and testing.
3. Implement in a dedicated branch/worktree. Parallel agents need isolated trees and clear file/API ownership. Preserve unrelated changes.
4. Execute applicable validation, record exact commands/results and never silently disable checks or replace real behavior with mocks.
5. Independent reviewer assesses original diff, acceptance criteria, correctness, regressions, safety, compatibility and test value; resolve blockers.
6. Document evidence, handoff SHA, outstanding limitations and next action. Never auto-merge or deploy/publish without approval.

## Relevant verification
- `bun run lint`
- `bun run test`
- `bun run build:api`
- `bun run build:web`
- `bun run test:api:integration (disposable PostgreSQL)`
- `bun run test:e2e:api`
- `bun run test:e2e:web`
- `bun run migration-test:baseline`

Only use disposable databases and safe fixtures for tests that mutate state; never use production credentials. Commands are guidance, not claims of execution. Confirm scripts and environmental prerequisites.

## Project-specific acceptance
Tenant authorization including cross-user reads/writes, clarification atomicity and concurrent retry (#10), refresh JWT lifecycle, migration chains/rollback strategy, estimation/calibration, full-stack E2E.

## Release boundary
Fresh and upgrade migration smoke, disposable DB, API/web real flow, secrets and deployment/rollback must be proven before release. Current default branch is develop; do not presume main.

See [Definition of Done](docs/engineering/DEFINITION_OF_DONE.md), [Independent review](docs/engineering/REVIEW_POLICY.md), [Release checklist](docs/engineering/RELEASE_CHECKLIST.md) and [PR template](.github/PULL_REQUEST_TEMPLATE.md).
