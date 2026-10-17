/** Minimal adapter: works with pg Pool/Client, TypeORM DataSource and compatible clients. */
export type BoundaryDatabase = { query(sql: string): Promise<Record<string, unknown>[]> };

/**
 * Experimental snapshot-based failure boundary probe.
 * Disposable, quiescent PostgreSQL databases ONLY.
 * Detects net row changes, not transient writes or writes outside selected tables.
 */
export type RowChange = {
  table: string;
  key: string;
  kind: 'inserted' | 'deleted' | 'updated';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export type TableSpec = { name: string; key: string };
type Snapshot = Map<string, Map<string, Record<string, unknown>>>;
const identifier = (value: string) => {
  if (!/^[a-z_][a-z_0-9]*$/i.test(value)) {
    throw new Error('MutationBoundary: unsafe SQL identifier');
  }
  return '"' + value.replace(/"/g, '""') + '"';
};
const stable = (value: unknown): string => {
  if (Object.prototype.toString.call(value) === '[object Date]') return JSON.stringify(Date.prototype.toISOString.call(value));
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return JSON.stringify(value.toString('base64'));
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, part]) => JSON.stringify(key) + ':' + stable(part)).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'undefined';
};

export async function takeBoundarySnapshot(
  db: BoundaryDatabase,
  tables: readonly TableSpec[],
  maxRowsPerTable = 5000
): Promise<Snapshot> {
  if (!tables.length) throw new Error('MutationBoundary: select at least one table');
  if (!Number.isSafeInteger(maxRowsPerTable) || maxRowsPerTable < 1) throw new Error('MutationBoundary: invalid snapshot limit');
  const snapshot: Snapshot = new Map();
  for (const table of tables) {
    const name = identifier(table.name);
    const key = identifier(table.key);
    const rows = await db.query(
      `SELECT * FROM ${name} ORDER BY ${key} LIMIT ${maxRowsPerTable + 1}`
    ) as Record<string, unknown>[];
    if (rows.length > maxRowsPerTable) throw new Error('MutationBoundary: snapshot row limit exceeded');
    const values = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row[table.key] == null) throw new Error('MutationBoundary: missing row key');
      const id = stable(row[table.key]);
      if (values.has(id)) throw new Error('MutationBoundary: duplicate row key');
      values.set(id, row);
    }
    snapshot.set(table.name, values);
  }
  return snapshot;
}

export function diffBoundarySnapshots(before: Snapshot, after: Snapshot): RowChange[] {
  const changes: RowChange[] = [];
  for (const [table, oldRows] of before) {
    const newRows = after.get(table);
    if (!newRows) throw new Error('MutationBoundary: incomplete after snapshot');
    for (const [key, previous] of oldRows) {
      const current = newRows.get(key);
      if (!current) changes.push({ table, key, kind: 'deleted', before: previous });
      else if (stable(previous) !== stable(current)) changes.push({
        table, key, kind: 'updated', before: previous, after: current,
      });
    }
    for (const [key, current] of newRows) if (!oldRows.has(key)) {
      changes.push({ table, key, kind: 'inserted', after: current });
    }
  }
  return changes;
}

export async function observeFailureBoundary(
  db: BoundaryDatabase,
  tables: readonly TableSpec[],
  action: () => Promise<void>
): Promise<RowChange[]> {
  const before = await takeBoundarySnapshot(db, tables);
  let actionError: unknown;
  try { await action(); } catch (error) { actionError = error; }
  const after = await takeBoundarySnapshot(db, tables);
  if (actionError) throw actionError;
  return diffBoundarySnapshots(before, after);
}
