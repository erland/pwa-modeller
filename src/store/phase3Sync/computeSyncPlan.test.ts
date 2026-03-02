import { computeSyncPlan } from './computeSyncPlan';

describe('computeSyncPlan', () => {
  test('defaults to revision 0 when lastAppliedRevision is undefined', () => {
    expect(computeSyncPlan({}).fromRevision).toBe(0);
  });

  test('defaults to revision 0 when lastAppliedRevision is null', () => {
    expect(computeSyncPlan({ lastAppliedRevision: null }).fromRevision).toBe(0);
  });

  test('uses lastAppliedRevision when it is a positive integer', () => {
    expect(computeSyncPlan({ lastAppliedRevision: 5 }).fromRevision).toBe(5);
  });

  test('floors fractional lastAppliedRevision', () => {
    expect(computeSyncPlan({ lastAppliedRevision: 5.9 }).fromRevision).toBe(5);
  });

  test('clamps negative revisions to 0', () => {
    expect(computeSyncPlan({ lastAppliedRevision: -1 }).fromRevision).toBe(0);
  });

  test('treats 0 as revision 0', () => {
    expect(computeSyncPlan({ lastAppliedRevision: 0 }).fromRevision).toBe(0);
  });

  test('treats NaN/infinite as revision 0', () => {
    expect(computeSyncPlan({ lastAppliedRevision: Number.NaN }).fromRevision).toBe(0);
    expect(computeSyncPlan({ lastAppliedRevision: Number.POSITIVE_INFINITY }).fromRevision).toBe(0);
  });
});
