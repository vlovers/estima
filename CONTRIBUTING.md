# Contributing to Estima

Estima is an Nx monorepo with NestJS, React, TypeORM and PostgreSQL. The default collaboration branch is `develop`.

## Start

1. Read [README.md](README.md), the code and linked Issues before changing behavior. When merged, `AGENTS.md` is the canonical agent contract; until then see [foundation PR #13](https://github.com/vlovers/estima/pull/13).
2. Use Node.js 24 and Bun 1.3.2 (as declared by the repository tooling), then install dependencies with `bun install --frozen-lockfile` to preserve the checked-in lockfile.
3. Branch from current `develop` and keep changes scoped to one verifiable outcome.
4. Add or update tests for the observable change. All external services and databases used by integration tests must be disposable.
5. Open a PR with linked Issue, acceptance criteria, actual commands and outcomes, operational risks, and a review handoff.

## Verification

Run checks relevant to your change, typically:

```sh
bun run lint
bun run test
bun run build:api
bun run build:web
```

For PostgreSQL schema, tenant boundaries, atomic writes, or migrations, use the documented disposable database configuration and run appropriate smoke and integration tests:

```sh
bun run migration-test:db:up
bun run migration-test:baseline
bun run test:api:integration
```

Browser and API end-to-end targets are available as `bun run test:e2e:web` and `bun run test:e2e:api`. They require their documented environment; do not pretend N/A is a pass.

## Security and integrity

Tenant authorization is mandatory on reads **and** mutations; prevent cross-user data leaks. Clarification persistence must be atomic under retries/concurrency (see [issue #10](https://github.com/vlovers/estima/issues/10)). Do not weaken migrations to make tests green, and do not point integration suites at shared or production databases.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting. Never add real credentials, tokens, customer data or production database dumps to Issues, PRs, tests or logs.

## Review and merge

The author provides evidence; the reviewer examines the diff and tests independently. Green CI alone is not a merge authorization. Avoid unrelated cleanups during urgent correctness fixes. Release/deployment approval is separate from PR acceptance.
