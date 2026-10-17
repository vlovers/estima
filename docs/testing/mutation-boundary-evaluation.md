# MutationBoundary experimental evaluation

This is an **experimental test helper**, not a production-ready library or proof of full transaction atomicity.

## Real Estima regression

The integration scenario in `api-provider-errors.int-spec.ts` drives Nest's
`PATCH /api/tasks/:id/clarify` over HTTP, injects a PostgreSQL trigger failure
during FINAL estimate insertion, and compares the final state of `tasks` and
`estimates` with their state before the request. Estima issue #10 concerns
non-atomic clarification persistence. No paid AI provider is called; this test
uses the existing local provider stub and disposable PostgreSQL harness.

The **characterization test** intentionally expects an unwanted `tasks.status`
change after HTTP 500. When the product bug is fixed, this test must be inverted
to require an empty diff, rather than left as an assertion of the broken state.

## How this compares with hand-written SQL assertions

Hand-written:

```ts
const before = await db.query('SELECT status, "clarificationHistory" FROM tasks WHERE id=$1', [taskId]);
await sendFailingRequest();
const after = await db.query('SELECT status, "clarificationHistory" FROM tasks WHERE id=$1', [taskId]);
expect(after).toEqual(before);
```

Experimental helper:

```ts
const changes = await observeFailureBoundary(
  db,
  [{ name: 'tasks', key: 'id' }, { name: 'estimates', key: 'id' }],
  sendFailingRequest
);
expect(changes).toEqual([]);
```

The helper automatically reports inserted, deleted and updated rows across
selected tables, including previous and new row values. It is *not always*
shorter or better than a focused SQL assertion, particularly for large tables
or fixtures with many unrelated rows.

## Boundaries and next steps

- Test databases must be disposable and quiescent (no concurrent writers).
- Each selected table needs a stable unique key, and row count must remain
  below the configured cap; identifier names are validated.
- Snapshot comparison observes **net committed state only**. It misses writes
  subsequently rolled back or reversed, external effects, unselected tables,
  sequences, and effects that occur after the action resolves.
- Full-row snapshots can include sensitive columns. Never print unredacted
  diffs into CI logs or use on a live database.
- The current implementation snapshots tables sequentially; cross-table
  snapshots are not guaranteed to reflect one database instant.
- This experiment currently has no automatic safety enforcement preventing
  connection to a non-disposable database. A reusable library **must** add a
  fail-closed disposable-DB guard, redaction and explicit scope rules.
- The `query()`-only adapter is intentionally ORM-independent; a separate
  package should depend on a minimal Postgres adapter and make unsupported
  client shapes explicit.
- Before publishing, test nulls, JSONB, buffers, timestamps, numeric types,
  composite keys, different schemas, and error paths against real PostgreSQL.

**Decision rule:** extract to independent OSS only if its report is materially
more actionable than focused SQL assertions, with no false pass on incomplete
observations. Otherwise keep it as an internal test utility.
