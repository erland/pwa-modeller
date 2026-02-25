/**
 * Internal change capture for future commit/sync.
 *
 * This is intentionally lightweight and UI-agnostic. The store accumulates a
 * ChangeSet during a transaction (or a single mutation), then flushes it once
 * when subscribers are notified.
 */

export type ChangeSet = {
  modelMetadataChanged: boolean;

  elementUpserts: string[];
  elementDeletes: string[];

  relationshipUpserts: string[];
  relationshipDeletes: string[];

  connectorUpserts: string[];
  connectorDeletes: string[];

  viewUpserts: string[];
  viewDeletes: string[];

  folderUpserts: string[];
  folderDeletes: string[];
};

export const emptyChangeSet = (): ChangeSet => ({
  modelMetadataChanged: false,
  elementUpserts: [],
  elementDeletes: [],
  relationshipUpserts: [],
  relationshipDeletes: [],
  connectorUpserts: [],
  connectorDeletes: [],
  viewUpserts: [],
  viewDeletes: [],
  folderUpserts: [],
  folderDeletes: [],
});
