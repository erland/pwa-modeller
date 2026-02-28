import type { DatasetId } from '../datasetTypes';
import type { OperationDto } from '../remoteDatasetApi';
import {
  _resetRemoteDatasetSessions,
  clearPendingOps,
  enqueuePendingOps,
  getLastAppliedRevision,
  getLastSeenOpId,
  getPendingOps,
  getServerRevision,
  isSseConnected,
  setLastAppliedRevision,
  setLastSeenOpId,
  setPendingOps,
  setServerRevision,
  setSseConnected,
  shiftPendingOps
} from '../remoteDatasetSession';

describe('remoteDatasetSession Phase 3 op sync state', () => {
  const ds1 = 'remote:ds1' as DatasetId;
  const ds2 = 'remote:ds2' as DatasetId;

  const opA: OperationDto = { opId: 'a', type: 'SNAPSHOT_REPLACE', payload: { a: 1 } };
  const opB: OperationDto = { opId: 'b', type: 'JSON_PATCH', payload: [{ op: 'replace', path: '/x', value: 2 }] };

  beforeEach(() => {
    _resetRemoteDatasetSessions();
  });

  it('defaults are stable per dataset', () => {
    expect(getServerRevision(ds1)).toBeNull();
    expect(getLastAppliedRevision(ds1)).toBeNull();
    expect(getPendingOps(ds1)).toEqual([]);
    expect(isSseConnected(ds1)).toBe(false);
    expect(getLastSeenOpId(ds1)).toBeNull();
  });

  it('can set serverRevision and lastAppliedRevision', () => {
    setServerRevision(ds1, 10);
    setLastAppliedRevision(ds1, 9);
    expect(getServerRevision(ds1)).toBe(10);
    expect(getLastAppliedRevision(ds1)).toBe(9);
  });

  it('pending ops queue supports set/enqueue/shift/clear', () => {
    setPendingOps(ds1, [opA]);
    enqueuePendingOps(ds1, opB);

    expect(getPendingOps(ds1).map((o) => o.opId)).toEqual(['a', 'b']);

    const shifted = shiftPendingOps(ds1, 1);
    expect(shifted.map((o) => o.opId)).toEqual(['a']);
    expect(getPendingOps(ds1).map((o) => o.opId)).toEqual(['b']);

    clearPendingOps(ds1);
    expect(getPendingOps(ds1)).toEqual([]);
  });

  it('shiftPendingOps is safe for edge cases', () => {
    enqueuePendingOps(ds1, opA);
    expect(shiftPendingOps(ds1, 0)).toEqual([]);
    expect(getPendingOps(ds1).map((o) => o.opId)).toEqual(['a']);
    expect(shiftPendingOps(ds1, -1)).toEqual([]);
    expect(getPendingOps(ds1).map((o) => o.opId)).toEqual(['a']);
    expect(shiftPendingOps(ds1, 5).map((o) => o.opId)).toEqual(['a']);
    expect(getPendingOps(ds1)).toEqual([]);
  });

  it('tracks SSE connection state and lastSeenOpId', () => {
    expect(isSseConnected(ds1)).toBe(false);
    setSseConnected(ds1, true);
    expect(isSseConnected(ds1)).toBe(true);

    expect(getLastSeenOpId(ds1)).toBeNull();
    setLastSeenOpId(ds1, 'op-123');
    expect(getLastSeenOpId(ds1)).toBe('op-123');
  });

  it('keeps per-dataset state isolated', () => {
    setServerRevision(ds1, 1);
    setLastAppliedRevision(ds1, 1);
    enqueuePendingOps(ds1, opA);
    setSseConnected(ds1, true);
    setLastSeenOpId(ds1, 'a');

    expect(getServerRevision(ds2)).toBeNull();
    expect(getLastAppliedRevision(ds2)).toBeNull();
    expect(getPendingOps(ds2)).toEqual([]);
    expect(isSseConnected(ds2)).toBe(false);
    expect(getLastSeenOpId(ds2)).toBeNull();
  });
});
