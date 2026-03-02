export type ComputeSyncPlanInput = {
  /**
   * The latest revision that has been applied locally.
   * `null`/`undefined` means "never synced".
   */
  lastAppliedRevision?: number | null;
};

export type SyncPlan = {
  /**
   * Revision to use when catching up (getOperationsSince) and when opening the SSE stream.
   */
  fromRevision: number;
};

/**
 * Pure, deterministic planning for the sync loop.
 *
 * Notes:
 * - This function intentionally contains NO I/O and has no dependency on store state.
 * - It is designed to be extended later (e.g. server revision hints, pending ops, etc.)
 *   while keeping unit tests stable.
 */
export function computeSyncPlan(input: ComputeSyncPlanInput): SyncPlan {
  const v = input.lastAppliedRevision;

  // Normalize to a safe non-negative integer revision.
  if (typeof v !== 'number' || !Number.isFinite(v)) return { fromRevision: 0 };
  if (v <= 0) return { fromRevision: 0 };
  return { fromRevision: Math.floor(v) };
}
