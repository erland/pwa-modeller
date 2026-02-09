import type { FolderKind } from '../../domain';

export type NavNodeKind = 'folder' | 'view' | 'element';

export type NavPayloadRef = {
  folderId?: string;
  viewId?: string;
  elementId?: string;

  /**
   * Virtual grouping id used when the tree is built without a real folder hierarchy.
   * Example: a synthetic "Views" section.
   */
  virtualId?: string;
};

export type NavBaseNode = {
  /**
   * Unique node id for UI state (expand/collapse). Prefixed by kind to avoid collisions.
   * Examples: "folder:<id>", "view:<id>", "element:<id>".
   */
  id: string;
  kind: NavNodeKind;
  label: string;
  payloadRef: NavPayloadRef;
  children?: NavNode[];
};

export type FolderNode = NavBaseNode & {
  kind: 'folder';
  payloadRef: NavPayloadRef & { folderId?: string; virtualId?: string };

  /** Present for real folders (not for virtual grouping nodes). */
  folderKind?: FolderKind;
  /** Present for real folders (not for virtual grouping nodes). */
  parentFolderId?: string;
  /** True when this node is a synthetic section rather than a Model folder. */
  isVirtual?: boolean;
};

export type ViewNode = NavBaseNode & {
  kind: 'view';
  payloadRef: NavPayloadRef & { viewId: string; folderId?: string };
};

export type ElementNode = NavBaseNode & {
  kind: 'element';
  payloadRef: NavPayloadRef & { elementId: string; folderId?: string };
};

export type NavNode = FolderNode | ViewNode | ElementNode;
