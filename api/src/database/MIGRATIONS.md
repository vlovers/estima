# Database migration chains

This project currently has two TypeORM migration chains.

## Legacy chain

The legacy chain is the historical default:

```text
api/src/database/migrations
```

Select it explicitly with `TYPEORM_MIGRATION_CHAIN=legacy`. These migrations
are preserved for existing databases and have not been rewritten.

CLI helper:

```bash
yarn typeorm:legacy migration:show
```

Known limitation: the legacy chain is not fresh-database safe. It contains
migrations that assume tables already exist and a coefficient seed that runs
before the `coefficients` table is created.

## Baseline chain

The baseline chain is intended for new, empty PostgreSQL databases:

```text
api/src/database/baseline-migrations
```

Select it explicitly:

```bash
TYPEORM_MIGRATION_CHAIN=baseline yarn typeorm:run-migrations
```

CLI helper:

```bash
yarn typeorm:baseline migration:show
```

The baseline chain creates the current schema from scratch and then seeds the
initial coefficient rows with keys used by the runtime calibration code.

`TYPEORM_MIGRATION_CHAIN` is intentionally required. Leaving it unset fails
fast instead of accidentally running the legacy chain against a fresh database
or switching an existing database to the baseline chain implicitly.

## Runtime startup policy

Runtime TypeORM configuration uses `synchronize: false`. The API does not
create, alter, or seed schema objects on startup.

Before accepting traffic, startup validates the connected database as a
baseline-managed database. The current runtime policy is intentionally
baseline-only and requires the TypeORM `migrations` table to contain exactly
these rows, in order:

1. `BaselineCurrentSchema20261014000000`
2. `SeedBaselineCoefficients20261014000001`
3. `AddTenantCalibrationFoundation20261014000002`

Startup also checks that baseline coefficient seed keys exist and that TypeORM
entity metadata has no pending schema SQL. If legacy migration rows, missing
baseline rows, unexpected extra rows, missing seed data, or metadata drift are
found, the API refuses to start.

## Current forward migrations

`AddTenantCalibrationFoundation20261014000002` adds the database foundation for
tenant-scoped calibration without changing the existing user-owned tenant model.
It creates `tenant_calibration_coefficients` for per-user coefficient state,
`coefficient_change_events` for immutable audit history, and nullable feedback
processing metadata on `estimate_feedbacks`. Existing feedback rows remain valid
because new feedback columns are nullable except `processingStatus`, which has a
`pending` default. The migration does not mutate global `coefficients` data.

## Future forward migrations

When a new forward migration is added after the baseline chain, update all
runtime and test expectations in the same change:

1. Add the migration to the selected migration chain.
2. Add the migration name to runtime validation in
   `api/src/database/runtime-schema.assertion.ts`.
3. Update migration smoke-test expected history in
   `api/src/database/scripts/baseline-migration-smoke-test.ts`.
4. Update disposable PostgreSQL integration expectations in
   `api/src/modules/security/tenant-isolation.int-spec.ts`.
5. Re-run the disposable migration smoke test and real HTTP/PostgreSQL
   integration suite.

Do not loosen runtime validation to accept arbitrary extra migration rows
without an explicit reconciliation plan.

## Existing databases

Do not run the baseline chain against an existing development or production
database until that database has been inspected and reconciled. Existing
databases that were shaped by `synchronize: true` may not match either
migration chain exactly.

Existing legacy-managed databases cannot start under the current baseline-only
runtime policy. They require explicit reconciliation before API startup.

Recommended transition:

1. Back up the database.
2. Export a schema-only dump.
3. Compare the schema against the baseline migration.
4. Add forward-only reconciliation migrations if needed.
5. Only after verification, mark or migrate the database into the selected
   chain intentionally.
