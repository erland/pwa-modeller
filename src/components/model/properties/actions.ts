import type {
  Element,
  Relationship,
  RelationshipType,
  View,
  ViewFormatting,
  ViewNodeLayout
} from '../../../domain';

export type ModelActions = {
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;

  updateViewNodeLayout: (viewId: string, elementId: string, patch: Partial<ViewNodeLayout>) => void;

  updateElement: (elementId: string, patch: Partial<Element>) => void;
  moveElementToFolder: (elementId: string, folderId: string) => void;
  deleteElement: (elementId: string) => void;

  updateRelationship: (relationshipId: string, patch: Partial<Relationship> & { type?: RelationshipType }) => void;
  deleteRelationship: (relationshipId: string) => void;

  updateView: (viewId: string, patch: Partial<View>) => void;
  moveViewToFolder: (viewId: string, folderId: string) => void;
  updateViewFormatting: (viewId: string, patch: Partial<ViewFormatting>) => void;
  cloneView: (viewId: string) => string | null;
  deleteView: (viewId: string) => void;
};
