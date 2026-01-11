import type {
  Element,
  Folder,
  RelationshipConnector,
  Relationship,
  RelationshipType,
  ViewConnectionRouteKind,
  ViewObject,
  View,
  ViewFormatting,
  ViewNodeLayout
} from '../../../domain';

export type ModelActions = {
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  updateFolder: (folderId: string, patch: Partial<Omit<Folder, 'id'>>) => void;

  updateViewNodeLayout: (viewId: string, elementId: string, patch: Partial<ViewNodeLayout>) => void;

  updateElement: (elementId: string, patch: Partial<Element>) => void;
  moveElementToFolder: (elementId: string, folderId: string) => void;
  deleteElement: (elementId: string) => void;

  updateRelationship: (relationshipId: string, patch: Partial<Relationship> & { type?: RelationshipType }) => void;
  deleteRelationship: (relationshipId: string) => void;

  /** Update per-view routing style for a ViewConnection instance. */
  setViewConnectionRoute: (viewId: string, connectionId: string, kind: ViewConnectionRouteKind) => void;

  updateConnector: (connectorId: string, patch: Partial<Omit<RelationshipConnector, 'id'>>) => void;
  deleteConnector: (connectorId: string) => void;

  updateViewObject: (viewId: string, objectId: string, patch: Partial<Omit<ViewObject, 'id'>>) => void;
  deleteViewObject: (viewId: string, objectId: string) => void;

  updateView: (viewId: string, patch: Partial<View>) => void;
  moveViewToFolder: (viewId: string, folderId: string) => void;
  moveViewToElement: (viewId: string, elementId: string) => void;
  updateViewFormatting: (viewId: string, patch: Partial<ViewFormatting>) => void;
  cloneView: (viewId: string) => string | null;
  deleteView: (viewId: string) => void;
};
