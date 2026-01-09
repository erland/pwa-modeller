/**
 * Types for the Model Navigator tree.
 *
 * Kept in a separate file so rendering and tree-building logic can live in
 * smaller modules without creating circular imports.
 */

// Drag payload for dragging an element from the tree into a view.
export const DND_ELEMENT_MIME = 'application/x-pwa-modeller-element-id';
// Drag payload for dragging a view between folders in the navigator.
export const DND_VIEW_MIME = 'application/x-pwa-modeller-view-id';
// Drag payload for dragging a folder between folders in the navigator.
export const DND_FOLDER_MIME = 'application/x-pwa-modeller-folder-id';

export type NavNodeKind = 'folder' | 'element' | 'view' | 'relationship' | 'section';

export type NavNode = {
  key: string;
  kind: NavNodeKind;
  label: string;
  secondary?: string; // rendered as a compact badge (e.g. counts)
  tooltip?: string;
  children?: NavNode[];
  scope?: 'elements' | 'views' | 'relationships' | 'other';

  // Actions
  canCreateFolder?: boolean;
  canCreateElement?: boolean;
  canCreateView?: boolean;
  /** Create a view centered on an element (only meaningful for element nodes). */
  canCreateCenteredView?: boolean;
  canDelete?: boolean;
  canRename?: boolean;

  // IDs
  folderId?: string;
  elementId?: string;
  viewId?: string;
  relationshipId?: string;
};
