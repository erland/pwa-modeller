import type { ImportReport } from '../importReport';
import { createImportReport, scanModelForUnknownTypes } from '../importReport';
import type { IRId, IRModel, IRTaggedValue } from '../framework/ir';

import type {
  ArchimateLayer,
  Element,
  ElementType,
  ExternalIdRef,
  Model,
  ModelMetadata,
  ModelKind,
  Relationship,
  RelationshipType,
  TaggedValue,
  View,
  ViewRelationshipLayout,
  ViewNodeLayout,
  ViewObject,
  ViewObjectType
} from '../../domain';
import { createElement, createId, createRelationship, createView, createViewObject, kindFromTypeId } from '../../domain';
import { ELEMENT_TYPES_BY_LAYER, RELATIONSHIP_TYPES } from '../../domain/config/archimatePalette';
import { VIEWPOINTS } from '../../domain/config/viewpoints';
import { modelStore } from '../../store';

export type ApplyImportOptions = {
  /** Overrides metadata; at minimum a name will be ensured. */
  metadata?: Partial<ModelMetadata>;
  /** A default model name if metadata.name is not provided. */
  defaultModelName?: string;

  /** Used for external id namespaces + unknown type info. */
  sourceSystem?: string;

  /**
   * What to do when an element/relationship type doesn't match the app's known enums.
   * - 'import-as-unknown': create domain objects with type 'Unknown' and preserve the original type name.
   * - 'skip': skip the item and add a warning.
   */
  unknownTypePolicy?: 'import-as-unknown' | 'skip';
};

export type ApplyImportMappings = {
  folders: Record<IRId, string>;
  elements: Record<IRId, string>;
  relationships: Record<IRId, string>;
  views: Record<IRId, string>;
  viewNodes: Record<IRId, { kind: 'element'; elementId: string } | { kind: 'object'; objectId: string }>;
};

export type ApplyImportResult = {
  modelId: string;
  mappings: ApplyImportMappings;
  report: ImportReport;
};

const KNOWN_ELEMENT_TO_LAYER: Map<string, ArchimateLayer> = (() => {
  const m = new Map<string, ArchimateLayer>();
  for (const [layer, types] of Object.entries(ELEMENT_TYPES_BY_LAYER) as Array<[ArchimateLayer, ElementType[]]>) {
    for (const t of types) m.set(t, layer);
  }
  return m;
})();

const KNOWN_REL_TYPES: Set<string> = new Set<string>(RELATIONSHIP_TYPES as unknown as string[]);

const KNOWN_VIEWPOINT_IDS: Set<string> = new Set<string>(VIEWPOINTS.map((v) => v.id));

function pushWarning(report: ImportReport, message: string): void {
  if (!report.warnings.includes(message)) report.warnings.push(message);
}

function toExternalIds(
  irIds: Array<{ system?: string; id: string; kind?: string }> | undefined,
  sourceSystem: string,
  originalIrId: string
): ExternalIdRef[] | undefined {
  const out: ExternalIdRef[] = [];

  for (const ref of irIds ?? []) {
    out.push({
      system: (ref.system && ref.system.trim().length > 0 ? ref.system : sourceSystem).trim(),
      id: ref.id
    });
  }

  // Preserve the original IR id as a stable external reference (unless already present).
  if (!out.some((x) => x.system === sourceSystem && x.id === originalIrId)) {
    out.push({ system: sourceSystem, id: originalIrId });
  }

  return out.length ? out : undefined;
}

function toTaggedValues(ir: IRTaggedValue[] | undefined, sourceSystem: string): TaggedValue[] | undefined {
  if (!ir || ir.length === 0) return undefined;
  const out: TaggedValue[] = [];
  for (const tv of ir) {
    const key = tv.key?.trim();
    if (!key) continue;
    out.push({
      id: createId('tv'),
      ns: sourceSystem,
      key,
      value: (tv.value ?? '').toString()
    });
  }
  return out.length ? out : undefined;
}

function resolveElementType(type: string): { kind: 'known'; type: ElementType; layer: ArchimateLayer } | { kind: 'unknown' } {
  const layer = KNOWN_ELEMENT_TO_LAYER.get(type);
  if (layer) return { kind: 'known', type: type as ElementType, layer };
  return { kind: 'unknown' };
}

function resolveRelationshipType(type: string): { kind: 'known'; type: RelationshipType } | { kind: 'unknown' } {
  if (KNOWN_REL_TYPES.has(type)) return { kind: 'known', type: type as RelationshipType };
  return { kind: 'unknown' };
}

function guessLayerFromTypeString(type: string): ArchimateLayer {
  const t = type.toLowerCase();
  if (t.includes('strategy')) return 'Strategy';
  if (t.includes('business')) return 'Business';
  if (t.includes('application')) return 'Application';
  if (t.includes('technology')) return 'Technology';
  if (t.includes('physical')) return 'Physical';
  if (t.includes('implementation') || t.includes('migration')) return 'ImplementationMigration';
  if (t.includes('motivation')) return 'Motivation';
  // Safe default.
  return 'Business';
}

function resolveViewpointId(viewpoint: string | undefined): string {
  const raw = (viewpoint ?? '').trim();
  if (!raw) return 'layered';

  // If importer already provided a built-in viewpoint id, accept it.
  if (KNOWN_VIEWPOINT_IDS.has(raw)) return raw;

  const lc = raw.toLowerCase();
  if (lc.includes('layer')) return 'layered';

  // Default fallback.
  return 'layered';
}

function inferModelKind(ir: IRModel, sourceSystem: string): ModelKind {
  const fmt = (ir.meta?.format ?? ir.meta?.sourceSystem ?? '').toString().toLowerCase();
  const src = (sourceSystem ?? '').toString().toLowerCase();

  const looksBpmn = fmt.includes('bpmn') || src.includes('bpmn');
  const looksUml = fmt.includes('uml') || src.includes('uml');

  if (looksBpmn) return 'bpmn';
  if (looksUml) return 'uml';

  // Heuristic fallback: inspect type prefixes.
  const anyBpmn = (ir.elements ?? []).some((e) => (e?.type ?? '').toString().startsWith('bpmn.'));
  if (anyBpmn) return 'bpmn';
  const anyUml = (ir.elements ?? []).some((e) => (e?.type ?? '').toString().startsWith('uml.'));
  if (anyUml) return 'uml';

  return 'archimate';
}


function getRootFolderId(model: Model): string {
  const roots = Object.values(model.folders).filter((f) => f.kind === 'root');
  if (roots.length !== 1) {
    // Extremely defensive fallback: pick first folder id.
    return roots[0]?.id ?? Object.keys(model.folders)[0];
  }
  return roots[0].id;
}


/**
 * Apply an import IR to the model store.
 *
 * This function:
 * - creates a new model
 * - creates folders/elements/relationships/views
 * - preserves source identifiers via externalIds
 * - returns a merged ImportReport (including unknown-type scanning)
 */
export function applyImportIR(ir: IRModel, baseReport?: ImportReport, options?: ApplyImportOptions): ApplyImportResult {
  const sourceSystem = (options?.sourceSystem ?? baseReport?.source ?? ir.meta?.sourceSystem ?? 'import').toString();
  const unknownTypePolicy = options?.unknownTypePolicy ?? 'import-as-unknown';

  const report: ImportReport = baseReport
    ? { ...baseReport, warnings: [...baseReport.warnings] }
    : createImportReport(sourceSystem);

  const nameFromIr =
    typeof ir.meta?.modelName === 'string' ? ir.meta.modelName : typeof ir.meta?.name === 'string' ? ir.meta.name : undefined;

  const metadata: ModelMetadata = {
    name: (options?.metadata?.name ?? nameFromIr ?? options?.defaultModelName ?? 'Imported model').toString(),
    description: options?.metadata?.description,
    version: options?.metadata?.version,
    owner: options?.metadata?.owner
  };

  // Use importer-provided format hints to create views with the correct notation.
  // (E.g. BPMN imports should create BPMN views so rendering uses the BPMN notation.)
  const inferredViewKind: ModelKind = inferModelKind(ir, sourceSystem);

  // 1) Create a new model
  modelStore.newModel(metadata);

  const state = modelStore.getState();
  const model = state.model;
  if (!model) throw new Error('applyImportIR: modelStore.newModel did not create a model');

  const mappings: ApplyImportMappings = {
    folders: {},
    elements: {},
    relationships: {},
    views: {},
    viewNodes: {}
  };

  const rootFolderId = getRootFolderId(model);

  // 2) Folders (create hierarchy)
  const irFolderById = new Map<string, (typeof ir.folders)[number]>();
  for (const f of ir.folders ?? []) {
    if (f && typeof f.id === 'string') irFolderById.set(f.id, f);
  }

  const ensureFolder = (irFolderId: string): string => {
    const existing = mappings.folders[irFolderId];
    if (existing) return existing;

    const irFolder = irFolderById.get(irFolderId);
    if (!irFolder) {
      // If referenced but missing, place under root.
      const created = modelStore.createFolder(rootFolderId, `Imported (${irFolderId})`);
      mappings.folders[irFolderId] = created;
      pushWarning(report, `Folder referenced but not found in IR: ${irFolderId} (created placeholder)`);
      return created;
    }

    const parentIr = irFolder.parentId ?? null;
    const parentId =
      parentIr && typeof parentIr === 'string' && parentIr.length > 0 ? ensureFolder(parentIr) : rootFolderId;

    const created = modelStore.createFolder(parentId, irFolder.name || 'Folder');
    mappings.folders[irFolderId] = created;

    // Attach external ids + tagged values
    const externalIds = toExternalIds(irFolder.externalIds, sourceSystem, irFolderId);
    const taggedValues = toTaggedValues(irFolder.taggedValues, sourceSystem);

    if (externalIds || taggedValues) {
      modelStore.updateFolder(created, { externalIds, taggedValues });
    }

    return created;
  };

  for (const f of ir.folders ?? []) {
    if (!f?.id) continue;
    try {
      ensureFolder(f.id);
    } catch (e) {
      pushWarning(report, `Failed to create folder "${f.name ?? f.id}": ${(e as Error).message}`);
    }
  }

  // 3) Elements
  for (const el of ir.elements ?? []) {
    if (!el?.id) continue;

    // Importers may canonicalize `el.type` to 'Unknown' and keep the original token in meta.
    // Prefer the original token when present so we can:
    // - infer the layer from the source type more accurately
    // - preserve unknown type names for later repair
    const sourceType = (typeof el.meta?.sourceType === 'string' ? (el.meta.sourceType as string) : el.type) ?? '';
    const inferredKind = kindFromTypeId(sourceType || el.type);

    // For UML/BPMN (qualified) types, preserve the type string directly.
    // They are valid ElementType values in our domain and should not be collapsed to 'Unknown'.
    const isNonArchimate = inferredKind !== 'archimate';

    const resolved = isNonArchimate ? { kind: 'known' as const, type: (sourceType || el.type) as ElementType, layer: undefined as unknown as ArchimateLayer } : resolveElementType(sourceType);
    if (resolved.kind === 'unknown' && unknownTypePolicy === 'skip') {
      pushWarning(report, `Skipped element with unknown type "${sourceType || el.type}": ${el.name ?? el.id}`);
      continue;
    }

    const internalId = createId('el');
    mappings.elements[el.id] = internalId;

    const externalIds = toExternalIds(el.externalIds, sourceSystem, el.id);
    const taggedValues = toTaggedValues(el.taggedValues, sourceSystem);

    const layer = isNonArchimate
      ? undefined
      : resolved.kind === 'known'
        ? resolved.layer
        : guessLayerFromTypeString(sourceType || el.type);

    const type: ElementType =
      isNonArchimate ? ((sourceType || el.type) as ElementType) : resolved.kind === 'known' ? resolved.type : ('Unknown' as ElementType);

    const domainEl: Element = {
      ...createElement({
        id: internalId,
        name: el.name ?? '',
        ...(layer ? { layer } : {}),
        type,
        documentation: el.documentation
      }),
      externalIds,
      taggedValues,
      ...(type === 'Unknown'
        ? { unknownType: { ns: sourceSystem, name: (sourceType || el.type || 'Unknown').toString() } }
        : {})
    };

    const folderId =
      el.folderId && typeof el.folderId === 'string'
        ? mappings.folders[el.folderId] ?? rootFolderId
        : rootFolderId;

    if (el.folderId && typeof el.folderId === 'string' && !mappings.folders[el.folderId]) {
      pushWarning(report, `Element "${el.name}" references missing folder "${el.folderId}" (placed at root)`);
    }

    try {
      modelStore.addElement(domainEl, folderId);
    } catch (e) {
      pushWarning(report, `Failed to add element "${el.name ?? el.id}": ${(e as Error).message}`);
    }
  }

  // 4) Relationships
  for (const rel of ir.relationships ?? []) {
    if (!rel?.id) continue;

    const sourceType = (typeof rel.meta?.sourceType === 'string' ? (rel.meta.sourceType as string) : rel.type) ?? '';
    const inferredKind = kindFromTypeId(sourceType || rel.type);
    const isNonArchimate = inferredKind !== 'archimate';

    const src = mappings.elements[rel.sourceId];
    const tgt = mappings.elements[rel.targetId];

    if (!src || !tgt) {
      pushWarning(
        report,
        `Skipped relationship "${rel.id}" (${sourceType || rel.type}) because source/target element was missing (source=${rel.sourceId}, target=${rel.targetId})`
      );
      continue;
    }

    const resolved = isNonArchimate ? { kind: 'known' as const, type: (sourceType || rel.type) as RelationshipType } : resolveRelationshipType(sourceType || rel.type);
    if (!isNonArchimate && resolved.kind === 'unknown' && unknownTypePolicy === 'skip') {
      pushWarning(report, `Skipped relationship with unknown type "${sourceType || rel.type}": ${rel.id}`);
      continue;
    }

    const internalId = createId('rel');
    mappings.relationships[rel.id] = internalId;

    const externalIds = toExternalIds(rel.externalIds, sourceSystem, rel.id);
    const taggedValues = toTaggedValues(rel.taggedValues, sourceSystem);

    const type: RelationshipType =
      isNonArchimate
        ? ((sourceType || rel.type) as RelationshipType)
        : resolved.kind === 'known'
          ? resolved.type
          : ('Unknown' as RelationshipType);

    const domainRel: Relationship = {
      ...createRelationship({
        id: internalId,
        sourceElementId: src,
        targetElementId: tgt,
        type,
        name: rel.name,
        documentation: rel.documentation
      }),
      externalIds,
      taggedValues,
      ...(type === 'Unknown'
        ? { unknownType: { ns: sourceSystem, name: (sourceType || rel.type || 'Unknown').toString() } }
        : {})
    };

    try {
      modelStore.addRelationship(domainRel);
    } catch (e) {
      pushWarning(report, `Failed to add relationship "${rel.id}": ${(e as Error).message}`);
    }
  }

  // 5) Views (optional)
  for (const v of ir.views ?? []) {
    if (!v?.id) continue;

    const internalId = createId('view');
    mappings.views[v.id] = internalId;

    const externalIds = toExternalIds(v.externalIds, sourceSystem, v.id);
    const taggedValues = toTaggedValues(v.taggedValues, sourceSystem);

    const viewpointId = resolveViewpointId(v.viewpoint);

    const view: View = {
      ...createView({
        id: internalId,
        name: v.name ?? 'View',
        kind: inferredViewKind,
        viewpointId,
        documentation: v.documentation
      }),
      externalIds,
      taggedValues
    };

    const folderId =
      v.folderId && typeof v.folderId === 'string'
        ? mappings.folders[v.folderId] ?? rootFolderId
        : rootFolderId;

    try {
      modelStore.addView(view, folderId);
    } catch (e) {
      pushWarning(report, `Failed to add view "${v.name ?? v.id}": ${(e as Error).message}`);
      continue;
    }

    // Nodes
    for (const n of v.nodes ?? []) {
      if (!n?.id) continue;

      const b = n.bounds;
      if (n.elementId) {
        const internalEl = mappings.elements[n.elementId];
        if (!internalEl) {
          pushWarning(report, `View "${v.name}" references missing element "${n.elementId}" (skipped node)`);
          continue;
        }

        try {
          modelStore.addElementToView(internalId, internalEl);
          if (b) {
            modelStore.updateViewNodeLayout(internalId, internalEl, {
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              zIndex: n.meta?.zIndex as number | undefined
            });
          }
          mappings.viewNodes[n.id] = { kind: 'element', elementId: internalEl };
        } catch (e) {
          pushWarning(report, `Failed to add element node to view "${v.name}": ${(e as Error).message}`);
        }
        continue;
      }

      // View-local object node (Label/Note/GroupBox)
      const label = n.label?.trim();
      const kind = n.kind;

      // Importers may override via meta.objectType, otherwise derive from IR node kind.
      const override = n.meta?.objectType as ViewObjectType | undefined;
      const objType: ViewObjectType =
        override ??
        (kind === 'group' ? 'GroupBox' : kind === 'note' ? 'Note' : kind === 'shape' || kind === 'image' ? 'Label' : label ? 'Label' : 'Note');

      const obj: ViewObject = createViewObject({
        id: createId('obj'),
        type: objType,
        text: label || undefined
      });

      const nodeLayout: ViewNodeLayout | undefined = b
        ? {
            objectId: obj.id,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            zIndex: n.meta?.zIndex as number | undefined
          }
        : undefined;

      try {
        modelStore.addViewObject(internalId, obj, nodeLayout);
        mappings.viewNodes[n.id] = { kind: 'object', objectId: obj.id };
      } catch (e) {
        pushWarning(report, `Failed to add view object node to view "${v.name}": ${(e as Error).message}`);
      }
    }

    // Connections (routing)
    const relLayouts: ViewRelationshipLayout[] = [];
    for (const c of v.connections ?? []) {
      if (!c?.id || !c.relationshipId) continue;
      const internalRel = mappings.relationships[c.relationshipId];
      if (!internalRel) {
        pushWarning(report, `View "${v.name}" references missing relationship "${c.relationshipId}" (skipped connection)`);
        continue;
      }
      relLayouts.push({
        relationshipId: internalRel,
        points: c.points?.map((p) => ({ x: p.x, y: p.y })),
        zIndex: (c.meta?.zIndex as number | undefined) ?? undefined
      });
    }

    if (relLayouts.length > 0) {
      try {
        const latest = modelStore.getState().model?.views[internalId];
        const existingNodes = latest?.layout?.nodes ?? [];
        modelStore.updateView(internalId, { layout: { nodes: existingNodes, relationships: relLayouts } });
      } catch (e) {
        pushWarning(report, `Failed to apply relationship routing in view "${v.name}": ${(e as Error).message}`);
      }
    }
  }

  // 6) Scan for unknown types (format-agnostic)
  const finalModel = modelStore.getState().model;
  if (finalModel) {
    const scan = scanModelForUnknownTypes(finalModel, report.source);
    if (scan) {
      report.unknownElementTypes = scan.unknownElementTypes;
      report.unknownRelationshipTypes = scan.unknownRelationshipTypes;
      // Keep warnings from both sides
      for (const w of scan.warnings) pushWarning(report, w);
    }
  }

  return {
    modelId: modelStore.getState().model?.id ?? model.id,
    mappings,
    report
  };
}
