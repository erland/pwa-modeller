// NOTE: extracted from src/store/remoteDatasetApi.ts to keep the public contract stable.

export type ValidationPolicy = 'none' | 'basic' | 'strict';

export type Role = 'VIEWER' | 'EDITOR' | 'OWNER';

export type ValidationError = {
  severity: string;
  rule: string;
  path: string;
  message: string;
};

export type ApiError = {
  timestamp?: string;
  status: number;
  // Some server versions return `code`, others return `errorCode`.
  code: string;
  errorCode?: string;
  message: string;
  path?: string;
  requestId?: string;
  // Only present for VALIDATION_FAILED today
  validationErrors?: ValidationError[];
};

export type OperationType = 'SNAPSHOT_REPLACE' | 'JSON_PATCH' | (string & {});

export type OperationDto = {
  opId: string;
  type: OperationType;
  payload: unknown;
};

export type AppendOperationsRequest = {
  baseRevision: number;
  operations: OperationDto[];
};

export type AppendOperationsResponse = {
  /** Optional for compatibility with server implementations that do not include it. */
  datasetId?: string;
  newRevision: number;
  acceptedCount?: number;
  // Some server versions may return additional metadata.
  [k: string]: unknown;
};

export type OperationEvent = {
  datasetId: string;
  revision: number;
  op: OperationDto;
  createdAt?: string | null;
  createdBy?: string | null;
};

export type OpsSinceResponse = {
  datasetId: string;
  fromRevision: number;
  items: OperationEvent[];
};

export type CurrentSnapshotResponse = {
  datasetId?: string;
  revision: number;
  payload: unknown;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type RevisionConflictResponse = {
  datasetId: string;
  currentRevision: number;
};

export type DuplicateOpIdResponse = {
  datasetId: string;
  opId: string;
  existingRevision: number;
};

export type LeaseConflictResponse = {
  datasetId: string;
  holderSub: string;
  expiresAt: string;
};

export type DatasetLeaseResponse =
  | {
      datasetId: string;
      active: false;
    }
  | {
      datasetId: string;
      active: true;
      holderSub: string;
      acquiredAt: string;
      renewedAt: string;
      expiresAt: string;
      // Only returned by POST (acquire/refresh). For GET it is null.
      leaseToken: string | null;
    };

export type DatasetHeadResponse = {
  datasetId: string;
  currentRevision: number;
  currentEtag: string;
  updatedAt: string | null;
  updatedBy: string | null;
  validationPolicy: ValidationPolicy;
  archivedAt: string | null;
  deletedAt: string | null;
  leaseActive: boolean;
  leaseHolderSub?: string | null;
  leaseExpiresAt?: string | null;
};

export type SnapshotConflictResponse = {
  datasetId: string;
  currentRevision: number;
  currentEtag: string;
  savedAt?: string | null;
  savedBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type SnapshotResponse = {
  datasetId: string;
  revision: number;
  savedAt?: string | null;
  savedBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  schemaVersion?: number | null;
  payload: unknown;
};

export type SnapshotHistoryItem = {
  revision: number;
  etag: string;
  // Phase 2 servers may provide either saved* or updated* fields; keep both optional for compatibility.
  savedAt: string | null;
  savedBy: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  // Optional message stored with the snapshot (if server supports it).
  message?: string | null;
  schemaVersion: number | null;
};

export type SnapshotHistoryResponse = {
  datasetId: string;
  items: SnapshotHistoryItem[];
};

export type RemoteDatasetListItem = {
  datasetId: string;
  name: string;
  description?: string | null;
  updatedAt?: string | number | null;
  createdAt?: string | number | null;

  // Phase 2 metadata (optional because server may omit fields depending on version)
  currentRevision?: number | null;
  validationPolicy?: ValidationPolicy | null;
  status?: 'ACTIVE' | 'ARCHIVED' | 'DELETED' | string | null;
  role?: Role | null;
};

export class RemoteDatasetApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: unknown;
  readonly requestId: string | null;
  readonly etag: string | null;

  constructor(args: {
    message: string;
    status: number;
    statusText: string;
    url: string;
    body: unknown;
    requestId: string | null;
    etag: string | null;
  }) {
    super(args.message);
    this.name = 'RemoteDatasetApiError';
    this.status = args.status;
    this.statusText = args.statusText;
    this.url = args.url;
    this.body = args.body;
    this.requestId = args.requestId;
    this.etag = args.etag;
  }
}

export type OpsStreamHandle = {
  /** Async iterable of OperationEvent payloads from the server stream. */
  events: AsyncIterable<OperationEvent>;
  /** Stop the stream. Safe to call multiple times. */
  close: () => void;
};
