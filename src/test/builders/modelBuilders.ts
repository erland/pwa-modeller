/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Deterministic, test-friendly builders for the EA Modeller core domain model.
 *
 * Goals:
 * - Small, composable helpers for creating valid-ish models/views quickly.
 * - Deterministic IDs by default (overrideable).
 * - Minimal required fields only; callers can spread overrides for specifics.
 */

import type {
  Element,
  Relationship,
  View,
  ViewLayout,
  ViewNodeLayout,
  ViewRelationshipLayout,
  ViewConnection,
  ViewConnectionEndpointKind,
  ViewConnectionRouteKind,
  Model,
  ModelKind,
  Folder,
  ElementType,
  RelationshipType,
  ModelMetadata,
} from '../../domain/types';

type IdFactory = (prefix?: string) => string;

const counters: Record<string, number> = {};

/**
 * Create a deterministic id factory. Useful when you want stable snapshots.
 *
 * Example:
 *   const id = makeIdFactory('t');
 *   id('el') -> "t_el_1"
 */
export function makeIdFactory(seed = 't'): IdFactory {
  return (prefix = 'id') => {
    const key = `${seed}:${prefix}`;
    counters[key] = (counters[key] ?? 0) + 1;
    return `${seed}_${prefix}_${counters[key]}`;
  };
}

/** Reset all deterministic counters (rarely needed, but useful between suites). */
export function resetDeterministicIds(): void {
  for (const k of Object.keys(counters)) delete counters[k];
}

const defaultId = makeIdFactory('t');

export function makeElement(
  partial: Partial<Element> & { type: ElementType; name?: string },
  id: IdFactory = defaultId,
): Element {
  const elementId = partial.id ?? id('el');
  return {
    id: elementId,
    name: partial.name ?? elementId,
    type: partial.type,
    kind: partial.kind,
    layer: partial.layer,
    unknownType: partial.unknownType,
    attrs: partial.attrs,
    documentation: partial.documentation,
    taggedValues: partial.taggedValues,
    externalIds: partial.externalIds,
  };
}

export function makeRelationship(
  partial: Partial<Relationship> & {
    type: RelationshipType;
    sourceElementId?: string;
    targetElementId?: string;
    sourceConnectorId?: string;
    targetConnectorId?: string;
  },
  id: IdFactory = defaultId,
): Relationship {
  const relId = partial.id ?? id('rel');
  return {
    id: relId,
    type: partial.type,
    kind: partial.kind,
    name: partial.name,
    documentation: partial.documentation,
    sourceElementId: partial.sourceElementId,
    sourceConnectorId: partial.sourceConnectorId,
    targetElementId: partial.targetElementId,
    targetConnectorId: partial.targetConnectorId,
    unknownType: partial.unknownType,
    attrs: partial.attrs,
    taggedValues: partial.taggedValues,
    externalIds: partial.externalIds,
  };
}

export function makeViewNode(
  partial: Partial<ViewNodeLayout> & ({ elementId: string } | { connectorId: string } | { objectId: string }),
): ViewNodeLayout {
  return {
    x: 0,
    y: 0,
    width: 120,
    height: 55,
    ...partial,
  };
}

export function makeViewRelationshipLayout(
  partial: Partial<ViewRelationshipLayout> & { relationshipId: string },
): ViewRelationshipLayout {
  return {
    ...partial,
  };
}

export function makeViewConnection(
  partial: Partial<ViewConnection> & {
    viewId: string;
    relationshipId: string;
    source: { kind: ViewConnectionEndpointKind; id: string };
    target: { kind: ViewConnectionEndpointKind; id: string };
    route?: { kind: ViewConnectionRouteKind };
  },
  id: IdFactory = defaultId,
): ViewConnection {
  const connId = partial.id ?? id('vc');
  return {
    id: connId,
    viewId: partial.viewId,
    relationshipId: partial.relationshipId,
    source: partial.source,
    target: partial.target,
    route: partial.route ?? { kind: 'straight' },
    sourceAnchor: partial.sourceAnchor,
    targetAnchor: partial.targetAnchor,
    points: partial.points,
    label: partial.label,
    zIndex: partial.zIndex,
  };
}

export function makeViewLayout(partial?: Partial<ViewLayout>): ViewLayout {
  return {
    nodes: [],
    relationships: [],
    ...partial,
  };
}

export function makeView(
  partial: Partial<View> & { kind: ModelKind; name?: string; viewpointId?: string },
  id: IdFactory = defaultId,
): View {
  const viewId = partial.id ?? id('view');
  return {
    id: viewId,
    name: partial.name ?? viewId,
    kind: partial.kind,
    viewpointId: partial.viewpointId ?? 'layered',
    documentation: partial.documentation,
    stakeholders: partial.stakeholders,
    formatting: partial.formatting,
    ownerRef: partial.ownerRef,
    relationshipVisibility: partial.relationshipVisibility,
    connections: partial.connections ?? [],
    objects: partial.objects,
    layout: partial.layout ?? makeViewLayout(),
    taggedValues: partial.taggedValues,
    externalIds: partial.externalIds,
  };
}

export function makeFolder(
  partial: Partial<Folder> & { name: string; kind: Folder['kind'] },
  id: IdFactory = defaultId,
): Folder {
  const folderId = partial.id ?? id('folder');
  return {
    id: folderId,
    name: partial.name,
    kind: partial.kind,
    parentId: partial.parentId,
    folderIds: partial.folderIds ?? [],
    elementIds: partial.elementIds ?? [],
    relationshipIds: partial.relationshipIds ?? [],
    viewIds: partial.viewIds ?? [],
    taggedValues: partial.taggedValues,
    externalIds: partial.externalIds,
  };
}

export function makeDefaultFolders(id: IdFactory = defaultId): Record<string, Folder> {
  const rootId = id('folder_root');
  const elementsId = id('folder_elements');
  const viewsId = id('folder_views');

  const root: Folder = {
    id: rootId,
    name: 'Root',
    kind: 'root',
    folderIds: [elementsId, viewsId],
    elementIds: [],
    relationshipIds: [],
    viewIds: [],
  };

  const elements: Folder = {
    id: elementsId,
    name: 'Elements',
    kind: 'elements',
    parentId: rootId,
    folderIds: [],
    elementIds: [],
    relationshipIds: [],
    viewIds: [],
  };

  const views: Folder = {
    id: viewsId,
    name: 'Views',
    kind: 'views',
    parentId: rootId,
    folderIds: [],
    elementIds: [],
    relationshipIds: [],
    viewIds: [],
  };

  return {
    [rootId]: root,
    [elementsId]: elements,
    [viewsId]: views,
  };
}

export function makeModel(
  // NOTE: Model.metadata is required and strongly typed as ModelMetadata in the app.
  // For tests we want to allow passing *partial* metadata. Using `Partial<Model>`
  // directly would keep `metadata?: ModelMetadata` and an intersection would
  // collapse back to `ModelMetadata`, causing TS errors. So we explicitly omit
  // metadata and re-introduce it as partial.
  partial?: Omit<Partial<Model>, 'metadata'> & {
    metadata?: Partial<ModelMetadata>;
  },
  id: IdFactory = defaultId,
): Model {
  const modelId = partial?.id ?? id('model');
  const folders = partial?.folders ?? makeDefaultFolders(id);

  return {
    id: modelId,
    metadata: {
      name: partial?.metadata?.name ?? 'Test Model',
      description: partial?.metadata?.description,
      version: partial?.metadata?.version,
      owner: partial?.metadata?.owner,
    },
    elements: partial?.elements ?? {},
    relationships: partial?.relationships ?? {},
    connectors: partial?.connectors,
    views: partial?.views ?? {},
    folders,
    schemaVersion: partial?.schemaVersion,
    taggedValues: partial?.taggedValues,
    externalIds: partial?.externalIds,
  };
}

/**
 * Convenience: build a model and automatically register ids into the default folders.
 * This is optional sugar for tests that rely on folders being populated.
 */
export function makeModelWithContent(
  args: {
    metadata?: Partial<ModelMetadata>;
    elements?: Element[];
    relationships?: Relationship[];
    views?: View[];
  },
  id: IdFactory = defaultId,
): Model {
  const model = makeModel({ metadata: args.metadata }, id);
  const folders = model.folders;
  const folderIds = Object.keys(folders);
  const root = folders[folderIds.find((fid) => folders[fid]?.kind === 'root') ?? folderIds[0]];
  const elementsFolder = folders[folderIds.find((fid) => folders[fid]?.kind === 'elements') ?? folderIds[0]];
  const viewsFolder = folders[folderIds.find((fid) => folders[fid]?.kind === 'views') ?? folderIds[0]];

  const elements = args.elements ?? [];
  const relationships = args.relationships ?? [];
  const views = args.views ?? [];

  const elementsRecord: Record<string, Element> = {};
  for (const e of elements) elementsRecord[e.id] = e;

  const relationshipsRecord: Record<string, Relationship> = {};
  for (const r of relationships) relationshipsRecord[r.id] = r;

  const viewsRecord: Record<string, View> = {};
  for (const v of views) viewsRecord[v.id] = v;

  // Populate folders
  elementsFolder.elementIds = elements.map((e) => e.id);
  elementsFolder.relationshipIds = relationships.map((r) => r.id);
  viewsFolder.viewIds = views.map((v) => v.id);

  // Keep root pointers intact
  root.folderIds = Array.from(new Set(root.folderIds ?? []));

  return {
    ...model,
    elements: elementsRecord,
    relationships: relationshipsRecord,
    views: viewsRecord,
    folders,
  };
}
