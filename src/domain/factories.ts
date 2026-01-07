import { createId } from './id';
import type { Element, Relationship, View, Model, ModelMetadata, Folder, FolderKind, RelationshipConnector } from './types';

function requireNonBlank(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

export type CreateElementInput = Omit<Element, 'id'> & { id?: string };
export function createElement(input: CreateElementInput): Element {
  requireNonBlank(input.name, 'Element.name');
  // layer/type are required at compile-time; this runtime check gives clearer errors.
  if (!input.layer) throw new Error('Element.layer is required');
  if (!input.type) throw new Error('Element.type is required');

  return {
    id: input.id ?? createId('el'),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    layer: input.layer,
    type: input.type,
    documentation: input.documentation?.trim() || undefined
  };
}

export type CreateRelationshipInput = Omit<Relationship, 'id'> & { id?: string };
export function createRelationship(input: CreateRelationshipInput): Relationship {
  const hasSource = !!(input.sourceElementId || input.sourceConnectorId);
  const hasTarget = !!(input.targetElementId || input.targetConnectorId);
  if (!hasSource) throw new Error('Relationship source endpoint is required');
  if (!hasTarget) throw new Error('Relationship target endpoint is required');
  if (!input.type) throw new Error('Relationship.type is required');

  return {
    id: input.id ?? createId('rel'),
    sourceElementId: input.sourceElementId,
    sourceConnectorId: input.sourceConnectorId,
    targetElementId: input.targetElementId,
    targetConnectorId: input.targetConnectorId,
    type: input.type,
    unknownType: input.unknownType,
    name: input.name?.trim() || undefined,
    description: input.description?.trim() || undefined,
    attrs: input.attrs,
    externalIds: input.externalIds ?? [],
    taggedValues: input.taggedValues ?? []
  };
}

export type CreateConnectorInput = Omit<RelationshipConnector, 'id'> & { id?: string };
export function createConnector(input: CreateConnectorInput): RelationshipConnector {
  if (!input.type) throw new Error('RelationshipConnector.type is required');

  return {
    id: input.id ?? createId('conn'),
    type: input.type,
    name: input.name?.trim() || undefined,
    description: input.description?.trim() || undefined,
    documentation: input.documentation?.trim() || undefined,
    externalIds: input.externalIds ?? [],
    taggedValues: input.taggedValues ?? []
  };
}

export type CreateViewInput = Omit<View, 'id'> & { id?: string };
export function createView(input: CreateViewInput): View {
  requireNonBlank(input.name, 'View.name');
  requireNonBlank(input.viewpointId, 'View.viewpointId');

  const formatting = input.formatting ?? { snapToGrid: true, gridSize: 20, layerStyleTags: {} };

  return {
    id: input.id ?? createId('view'),
    name: input.name.trim(),
    viewpointId: input.viewpointId.trim(),
    description: input.description?.trim() || undefined,
    documentation: input.documentation?.trim() || undefined,
    stakeholders: input.stakeholders,
    formatting,
    centerElementId: input.centerElementId,
    layout: input.layout
  };
}

export function createFolder(name: string, kind: FolderKind, parentId?: string, id?: string): Folder {
  requireNonBlank(name, 'Folder.name');
  return {
    id: id ?? createId('folder'),
    name: name.trim(),
    kind,
    parentId,
    folderIds: [],
    elementIds: [],
    relationshipIds: [],
    viewIds: [],
    externalIds: [],
    taggedValues: []
  };
}

export function createEmptyModel(metadata: ModelMetadata, id?: string): Model {
  requireNonBlank(metadata.name, 'Model.metadata.name');

  const modelId = id ?? createId('model');
  // v2+: a single root folder that can contain both elements and views.
  const root = createFolder('Model', 'root', undefined, createId('folder'));

  return {
    id: modelId,
    metadata: {
      name: metadata.name.trim(),
      description: metadata.description?.trim() || undefined,
      version: metadata.version?.trim() || undefined,
      owner: metadata.owner?.trim() || undefined
    },
    externalIds: [],
    taggedValues: [],
    elements: {},
    relationships: {},
    connectors: {},
    views: {},
    folders: {
      [root.id]: root
    },
    schemaVersion: 4
  };
}
