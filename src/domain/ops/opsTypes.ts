// Domain-level operation types used by Phase 3 remote dataset sync.
//
// NOTE: The Phase 3 server currently supports only SNAPSHOT_REPLACE and JSON_PATCH.

export const SNAPSHOT_REPLACE = 'SNAPSHOT_REPLACE' as const;
export const JSON_PATCH = 'JSON_PATCH' as const;

export type OperationType = typeof SNAPSHOT_REPLACE | typeof JSON_PATCH | (string & {});

export type Operation<Payload = unknown> = {
  opId: string;
  type: OperationType;
  payload: Payload;
};

// JSON Patch subset used by the Phase 3 server (RFC 6902).
export type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown };
