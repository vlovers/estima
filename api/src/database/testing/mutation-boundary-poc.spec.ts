import { diffBoundarySnapshots, observeFailureBoundary, takeBoundarySnapshot } from './mutation-boundary-poc';

const tables = [{ name: 'tasks', key: 'id' }] as const;
type Row = Record<string, unknown>;

function fakeDb(before: Row[], after: Row[]) {
  let reads = 0;
  const db = {
    query: jest.fn(async (_sql: string): Promise<Row[]> => {
      return structuredClone(reads++ === 0 ? before : after);
    }),
  };
  return db;
}

describe('MutationBoundary experimental core', () => {
  it('reports an inserted row', async () => {
    const db = fakeDb([{ id: 1, status: 'pending' }], [
      { id: 1, status: 'pending' },
      { id: 2, status: 'estimated' },
    ]);
    const changes = await observeFailureBoundary(db, tables, async () => {});
    expect(changes).toEqual([
      { table: 'tasks', key: '2', kind: 'inserted', after: { id: 2, status: 'estimated' } },
    ]);
  });

  it('reports a deleted row', async () => {
    const db = fakeDb([{ id: 1 }, { id: 2 }], [{ id: 1 }]);
    expect(await observeFailureBoundary(db, tables, async () => {})).toEqual([
      { table: 'tasks', key: '2', kind: 'deleted', before: { id: 2 } },
    ]);
  });

  it('reports an updated row with before and after values', async () => {
    const db = fakeDb([{ id: 1, status: 'pending' }], [{ id: 1, status: 'estimated' }]);
    expect(await observeFailureBoundary(db, tables, async () => {})).toEqual([
      {
        table: 'tasks', key: '1', kind: 'updated',
        before: { id: 1, status: 'pending' },
        after: { id: 1, status: 'estimated' },
      },
    ]);
  });

  it('ignores differences in JSON object key order and detects Date changes', async () => {
    const unchanged = fakeDb(
      [{ id: 1, details: { a: 1, b: 2 } }],
      [{ id: 1, details: { b: 2, a: 1 } }]
    );
    expect(await observeFailureBoundary(unchanged, tables, async () => {})).toEqual([]);
    const changed = fakeDb(
      [{ id: 1, createdAt: new Date('2026-01-01T00:00:00.000Z') }],
      [{ id: 1, createdAt: new Date('2026-01-02T00:00:00.000Z') }]
    );
    expect(await observeFailureBoundary(changed, tables, async () => {})).toHaveLength(1);
  });

  it('rejects an unsafe SQL identifier without executing a query', async () => {
    const db = fakeDb([], []);
    await expect(takeBoundarySnapshot(db, [{ name: 'tasks;DROP TABLE tasks', key: 'id' }]))
      .rejects.toThrow('unsafe SQL identifier');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('fails explicitly on an incomplete snapshot caused by a row limit', async () => {
    const db = fakeDb([{ id: 1 }, { id: 2 }], []);
    await expect(takeBoundarySnapshot(db, tables, 1)).rejects.toThrow('snapshot row limit exceeded');
  });

  it('propagates action errors instead of misreporting an empty mutation set', async () => {
    const db = fakeDb([{ id: 1 }], [{ id: 1, status: 'changed' }]);
    await expect(observeFailureBoundary(db, tables, async () => {
      throw new Error('request failed unexpectedly');
    })).rejects.toThrow('request failed unexpectedly');
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('does not confuse no mutation with a failed precondition', async () => {
    const before = new Map([['tasks', new Map([['1', { id: 1 }]])]]);
    const after = new Map([['tasks', new Map([['1', { id: 1 }]])]]);
    expect(diffBoundarySnapshots(before, after)).toEqual([]);
  });
});
