import type { ChangeSet } from './changeSet';
import { emptyChangeSet } from './changeSet';

type Mutable = {
  modelMetadataChanged: boolean;
  elementUpserts: Set<string>;
  elementDeletes: Set<string>;
  relationshipUpserts: Set<string>;
  relationshipDeletes: Set<string>;
  connectorUpserts: Set<string>;
  connectorDeletes: Set<string>;
  viewUpserts: Set<string>;
  viewDeletes: Set<string>;
  folderUpserts: Set<string>;
  folderDeletes: Set<string>;
};

const emptyMutable = (): Mutable => ({
  modelMetadataChanged: false,
  elementUpserts: new Set(),
  elementDeletes: new Set(),
  relationshipUpserts: new Set(),
  relationshipDeletes: new Set(),
  connectorUpserts: new Set(),
  connectorDeletes: new Set(),
  viewUpserts: new Set(),
  viewDeletes: new Set(),
  folderUpserts: new Set(),
  folderDeletes: new Set(),
});

const toSortedArray = (s: Set<string>): string[] => Array.from(s).sort();

/**
 * Accumulates changes during a store transaction, then can be flushed as an
 * immutable, deterministic ChangeSet.
 */
export class ChangeSetRecorder {
  private current: Mutable = emptyMutable();

  reset = (): void => {
    this.current = emptyMutable();
  };

  hasChanges = (): boolean => {
    const c = this.current;
    return (
      c.modelMetadataChanged ||
      c.elementUpserts.size > 0 ||
      c.elementDeletes.size > 0 ||
      c.relationshipUpserts.size > 0 ||
      c.relationshipDeletes.size > 0 ||
      c.connectorUpserts.size > 0 ||
      c.connectorDeletes.size > 0 ||
      c.viewUpserts.size > 0 ||
      c.viewDeletes.size > 0 ||
      c.folderUpserts.size > 0 ||
      c.folderDeletes.size > 0
    );
  };

  flush = (): ChangeSet | null => {
    if (!this.hasChanges()) return null;
    const c = this.current;
    const out: ChangeSet = {
      ...emptyChangeSet(),
      modelMetadataChanged: c.modelMetadataChanged,
      elementUpserts: toSortedArray(c.elementUpserts),
      elementDeletes: toSortedArray(c.elementDeletes),
      relationshipUpserts: toSortedArray(c.relationshipUpserts),
      relationshipDeletes: toSortedArray(c.relationshipDeletes),
      connectorUpserts: toSortedArray(c.connectorUpserts),
      connectorDeletes: toSortedArray(c.connectorDeletes),
      viewUpserts: toSortedArray(c.viewUpserts),
      viewDeletes: toSortedArray(c.viewDeletes),
      folderUpserts: toSortedArray(c.folderUpserts),
      folderDeletes: toSortedArray(c.folderDeletes),
    };
    this.reset();
    return out;
  };

  markModelMetadataChanged = (): void => {
    this.current.modelMetadataChanged = true;
  };

  upsertElement = (id: string): void => {
    this.current.elementUpserts.add(id);
    this.current.elementDeletes.delete(id);
  };

  deleteElement = (id: string): void => {
    this.current.elementDeletes.add(id);
    this.current.elementUpserts.delete(id);
  };

  upsertRelationship = (id: string): void => {
    this.current.relationshipUpserts.add(id);
    this.current.relationshipDeletes.delete(id);
  };

  deleteRelationship = (id: string): void => {
    this.current.relationshipDeletes.add(id);
    this.current.relationshipUpserts.delete(id);
  };

  upsertConnector = (id: string): void => {
    this.current.connectorUpserts.add(id);
    this.current.connectorDeletes.delete(id);
  };

  deleteConnector = (id: string): void => {
    this.current.connectorDeletes.add(id);
    this.current.connectorUpserts.delete(id);
  };

  upsertView = (id: string): void => {
    this.current.viewUpserts.add(id);
    this.current.viewDeletes.delete(id);
  };

  deleteView = (id: string): void => {
    this.current.viewDeletes.add(id);
    this.current.viewUpserts.delete(id);
  };

  upsertFolder = (id: string): void => {
    this.current.folderUpserts.add(id);
    this.current.folderDeletes.delete(id);
  };

  deleteFolder = (id: string): void => {
    this.current.folderDeletes.add(id);
    this.current.folderUpserts.delete(id);
  };
}
