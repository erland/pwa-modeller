import { createId } from './id';
import { kindFromTypeId } from './kindFromTypeId';
import type {
  Element,
  Relationship,
  View,
  Model,
  ModelMetadata,
  Folder,
  FolderKind,
  RelationshipConnector,
  ViewObject,
  ViewObjectType,
  ViewNodeLayout,
  ViewObjectTextAlign
} from './types';

function requireNonBlank(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}


function defaultBpmnAttrs(type: string): unknown | undefined {
  // Keep defaults minimal and future-proof; UI can extend later.
  // We intentionally avoid heavy schema logic here.
  switch (type) {
    // Gateways
    case 'bpmn.gatewayExclusive':
      return { gatewayKind: 'exclusive' };
    case 'bpmn.gatewayParallel':
      return { gatewayKind: 'parallel' };
    case 'bpmn.gatewayInclusive':
      return { gatewayKind: 'inclusive' };
    case 'bpmn.gatewayEventBased':
      return { gatewayKind: 'eventBased' };

    // Events
    case 'bpmn.startEvent':
      return { eventKind: 'start', eventDefinition: { kind: 'none' } };
    case 'bpmn.endEvent':
      return { eventKind: 'end', eventDefinition: { kind: 'none' } };
    case 'bpmn.intermediateCatchEvent':
      return { eventKind: 'intermediateCatch', eventDefinition: { kind: 'none' } };
    case 'bpmn.intermediateThrowEvent':
      return { eventKind: 'intermediateThrow', eventDefinition: { kind: 'none' } };
    case 'bpmn.boundaryEvent':
      // Default to interrupting boundary with no definition; user can pick in properties.
      return { eventKind: 'boundary', eventDefinition: { kind: 'none' }, cancelActivity: true };

    // Activities
    case 'bpmn.callActivity':
      return { loopType: 'none', isCall: true };
    case 'bpmn.subProcess':
      return { loopType: 'none', subProcessType: 'embedded', isExpanded: true };

    default:
      // Default for tasks/activities: no loop.
      if (type.startsWith('bpmn.') && type !== 'bpmn.pool' && type !== 'bpmn.lane' && type !== 'bpmn.textAnnotation') {
        if (type.startsWith('bpmn.gateway')) return undefined;
        if (type.endsWith('Event')) return undefined;
        // Treat the rest as activities.
        return { loopType: 'none' };
      }
      return undefined;
  }
}

function defaultUmlRelationshipAttrs(type: string): unknown | undefined {
  // Keep defaults minimal. We only provide a predictable object shape for association-like
  // relationships so import/UI code can attach end metadata without special-casing `undefined`.
  switch (type) {
    case 'uml.association':
    case 'uml.aggregation':
    case 'uml.composition':
      return {
        sourceRole: undefined,
        targetRole: undefined,
        sourceMultiplicity: undefined,
        targetMultiplicity: undefined,
        sourceNavigable: undefined,
        targetNavigable: undefined,
        stereotype: undefined,
      };
    default:
      return undefined;
  }
}

export type CreateElementInput = Omit<Element, 'id'> & { id?: string; description?: string };
export function createElement(input: CreateElementInput): Element {
  requireNonBlank(input.name, 'Element.name');
  // type is required at compile-time; runtime check gives clearer errors.
  if (!input.type) throw new Error('Element.type is required');

  const kind = input.kind ?? kindFromTypeId(input.type);
  if (kind === 'archimate' && !input.layer) throw new Error('Element.layer is required for archimate elements');

  // Notation-specific semantic attributes.
  // For UML Class/Interface/DataType we default to empty member lists so the UI never has to handle undefined.
  const attrs =
    input.attrs !== undefined
      ? input.attrs
      : kind === 'uml' && (input.type === 'uml.class' || input.type === 'uml.associationClass' || input.type === 'uml.interface' || input.type === 'uml.datatype')
        ? { attributes: [], operations: [] }
        : kind === 'bpmn'
          ? defaultBpmnAttrs(String(input.type))
          : undefined;

  return {
    id: input.id ?? createId('el'),
    kind,
    name: input.name.trim(),
    layer: input.layer,
    type: input.type,
    unknownType: input.unknownType,
    attrs,
    documentation: (input.documentation ?? input.description)?.trim() || undefined,
    externalIds: input.externalIds && input.externalIds.length ? input.externalIds : undefined,
    taggedValues: input.taggedValues && input.taggedValues.length ? input.taggedValues : undefined
  };
}

export type CreateRelationshipInput = Omit<Relationship, 'id'> & { id?: string; description?: string };
export function createRelationship(input: CreateRelationshipInput): Relationship {
  const hasSource = !!(input.sourceElementId || input.sourceConnectorId);
  const hasTarget = !!(input.targetElementId || input.targetConnectorId);
  if (!hasSource) throw new Error('Relationship source endpoint is required');
  if (!hasTarget) throw new Error('Relationship target endpoint is required');
  if (!input.type) throw new Error('Relationship.type is required');

  const kind = input.kind ?? kindFromTypeId(input.type as unknown as string);

  // Notation-specific semantic attributes.
  // For UML association-like relationships we default to a stable "end metadata" object shape.
  const attrs =
    input.attrs !== undefined
      ? input.attrs
      : kind === 'uml'
        ? defaultUmlRelationshipAttrs(String(input.type))
        : undefined;

  return {
    id: input.id ?? createId('rel'),
    kind,
    sourceElementId: input.sourceElementId,
    sourceConnectorId: input.sourceConnectorId,
    targetElementId: input.targetElementId,
    targetConnectorId: input.targetConnectorId,
    type: input.type,
    unknownType: input.unknownType,
    name: input.name?.trim() || undefined,
    documentation: (input.documentation ?? input.description)?.trim() || undefined,
    attrs,
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
    documentation: input.documentation?.trim() || undefined,
    externalIds: input.externalIds ?? [],
    taggedValues: input.taggedValues ?? []
  };
}

export type CreateViewInput = Omit<View, 'id' | 'connections' | 'kind'> & {
  id?: string;
  connections?: View['connections'];
  /** Optional for backward compatibility; defaults to 'archimate'. */
  kind?: View['kind'];
};
export function createView(input: CreateViewInput): View {
  requireNonBlank(input.name, 'View.name');
  requireNonBlank(input.viewpointId, 'View.viewpointId');

  const formatting = input.formatting ?? { snapToGrid: true, gridSize: 20, layerStyleTags: {} };

  return {
    id: input.id ?? createId('view'),
    name: input.name.trim(),
    kind: input.kind ?? 'archimate',
    relationshipVisibility: input.relationshipVisibility,
    ownerRef: input.ownerRef,
    viewpointId: input.viewpointId.trim(),
    documentation: input.documentation?.trim() || undefined,
    stakeholders: input.stakeholders,
    formatting,
    connections: input.connections ?? [],
    externalIds: input.externalIds,
    taggedValues: input.taggedValues,
    // View-local diagram objects (notes/labels/group boxes). Optional in the schema, but
    // new views should start with an empty map for a predictable runtime shape.
    objects: input.objects ?? {},
    layout: input.layout
  };
}

// ------------------------------------
// View-only (diagram) objects
// ------------------------------------

export type CreateViewObjectInput = Omit<ViewObject, 'id'> & { id?: string };

function sanitizeTextAlign(raw: unknown): ViewObjectTextAlign | undefined {
  if (raw === 'left' || raw === 'center' || raw === 'right') return raw;
  return undefined;
}

/**
 * Create a view-local diagram object (Note/Label/GroupBox).
 * These objects are NOT part of the ArchiMate model; they only live inside a view.
 */
export function createViewObject(input: CreateViewObjectInput): ViewObject {
  if (!input.type) throw new Error('ViewObject.type is required');

  const id = input.id ?? createId('obj');
  const name = input.name?.trim();
  const text = input.text?.trim();

  const defaultName = input.type === 'GroupBox' ? 'Group' : undefined;
  const defaultText = input.type === 'Note' ? 'Note' : input.type === 'Label' ? 'Label' : undefined;

  const styleRaw = input.style;
  const style =
    styleRaw && typeof styleRaw === 'object'
      ? {
          fill: typeof styleRaw.fill === 'string' ? styleRaw.fill : undefined,
          stroke: typeof styleRaw.stroke === 'string' ? styleRaw.stroke : undefined,
          textAlign: sanitizeTextAlign(styleRaw.textAlign)
        }
      : undefined;

  return {
    id,
    type: input.type,
    name: name && name.length > 0 ? name : defaultName,
    text: text && text.length > 0 ? text : defaultText,
    style
  };
}

export function getDefaultViewObjectSize(type: ViewObjectType): { width: number; height: number } {
  switch (type) {
    case 'Label':
      return { width: 160, height: 36 };
    case 'Divider':
      return { width: 240, height: 10 };
    case 'GroupBox':
      return { width: 320, height: 200 };
    case 'Note':
    default:
      return { width: 220, height: 140 };
  }
}

/** Create a `ViewNodeLayout` that places a view-local object in a view. */
export function createViewObjectNodeLayout(
  objectId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex?: number
): ViewNodeLayout {
  return {
    objectId,
    x,
    y,
    width,
    height,
    zIndex
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
    // Bump when the persisted schema changes.
    // v5 introduces model.connectors (relationship connectors / junctions).
    // v6 introduces view.objects + view-only layout nodes (notes/labels/group boxes).
    // v8 introduces view.connections (per-view relationship instances).
    // v9 introduces view.kind (diagram notation).
    // v10 normalizes BPMN attrs for non-activity containers and global defs.
    // v11 renames UML attribute datatype fields (type/typeName/typeRef -> dataTypeName/dataTypeRef).
    schemaVersion: 11
  };
}
