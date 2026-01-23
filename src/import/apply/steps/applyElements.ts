import type { ApplyImportContext } from '../applyImportTypes';
import type { ArchimateLayer, Element, ElementType, ModelKind } from '../../../domain';
import { createElement, createId, kindFromTypeId } from '../../../domain';
import { sanitizeUmlClassifierAttrs } from '../../../domain/uml/members';
import { modelStore } from '../../../store';
import { guessLayerFromTypeString, pushWarning, resolveElementType, toExternalIds, toTaggedValues } from '../applyImportHelpers';

export function applyElements(ctx: ApplyImportContext): void {
  const { ir, sourceSystem, report, unknownTypePolicy, rootFolderId, mappings } = ctx;

  // -------------------------------------------------------------------------
  // IMPORTANT: two-pass mapping.
  //
  // Some IR attributes reference other IR element ids (e.g. BPMN eventDefinition.messageRef,
  // boundaryEvent.attachedToRef). During apply we generate new internal ids, so we must
  // translate those references using `mappings.elements`.
  //
  // To make this deterministic regardless of element ordering in the source file, we first
  // allocate internal ids for *all* IR elements, then do a second pass that creates domain
  // elements using the completed mapping.
  // -------------------------------------------------------------------------

  for (const el of ir.elements ?? []) {
    if (!el?.id) continue;
    if (!mappings.elements[el.id]) {
      mappings.elements[el.id] = createId('el');
    }
  }

  const mapBpmnRef = (ref: unknown): string | undefined => {
    if (typeof ref !== 'string' || !ref.trim()) return undefined;
    return mappings.elements[ref] ?? ref;
  };

  const rewriteBpmnAttrs = (attrs: unknown): unknown => {
    if (!attrs || typeof attrs !== 'object') return attrs;
    const a: any = { ...(attrs as any) };

    // Boundary events attach to a host activity/task.
    if (a.attachedToRef) a.attachedToRef = mapBpmnRef(a.attachedToRef);

    // Data references point to global definitions.
    if (a.dataObjectRef) a.dataObjectRef = mapBpmnRef(a.dataObjectRef);
    if (a.dataStoreRef) a.dataStoreRef = mapBpmnRef(a.dataStoreRef);

    // Lane containment: translate flow node references to internal element ids.
    if (Array.isArray(a.flowNodeRefs)) {
      a.flowNodeRefs = a.flowNodeRefs
        .map((r: unknown) => mapBpmnRef(r))
        .filter((r: unknown) => typeof r === 'string' && r.length > 0);
    }

    // Event definitions may reference global BPMN definitions.
    const ed = a.eventDefinition;
    if (ed && typeof ed === 'object') {
      const ed2: any = { ...(ed as any) };
      if (ed2.messageRef) ed2.messageRef = mapBpmnRef(ed2.messageRef);
      if (ed2.signalRef) ed2.signalRef = mapBpmnRef(ed2.signalRef);
      if (ed2.errorRef) ed2.errorRef = mapBpmnRef(ed2.errorRef);
      if (ed2.escalationRef) ed2.escalationRef = mapBpmnRef(ed2.escalationRef);
      a.eventDefinition = ed2;
    }

    // Gateway default flow may reference a sequenceFlow relationship id, which is not an element.
    // We intentionally do not rewrite defaultFlowRef here.

    return a;
  };

  for (const el of ir.elements ?? []) {
    if (!el?.id) continue;

    // Importers may canonicalize `el.type` to 'Unknown' and keep the original token in meta.
    // Prefer the original token when present.
    const sourceType = (typeof el.meta?.sourceType === 'string' ? (el.meta.sourceType as string) : el.type) ?? '';
    const inferredKind: ModelKind = kindFromTypeId(sourceType || el.type);

    // For UML/BPMN (qualified) types, preserve the type string directly.
    const isNonArchimate = inferredKind !== 'archimate';

    const resolved = isNonArchimate
      ? { kind: 'known' as const, type: (sourceType || el.type) as ElementType, layer: undefined as unknown as ArchimateLayer }
      : resolveElementType(sourceType);

    if (!isNonArchimate && resolved.kind === 'unknown' && unknownTypePolicy === 'skip') {
      pushWarning(report, `Skipped element with unknown type "${sourceType || el.type}": ${el.name ?? el.id}`);
      continue;
    }

    const internalId = mappings.elements[el.id] ?? createId('el');
    mappings.elements[el.id] = internalId;

    const externalIds = toExternalIds(el.externalIds, sourceSystem, el.id);
    const taggedValues = toTaggedValues(el.taggedValues, sourceSystem);

    const layer =
      isNonArchimate
        ? undefined
        : resolved.kind === 'known'
          ? resolved.layer
          : guessLayerFromTypeString(sourceType || el.type);

    const type: ElementType =
      isNonArchimate
        ? ((sourceType || el.type) as ElementType)
        : resolved.kind === 'known'
          ? resolved.type
          : ('Unknown' as ElementType);

    // Step 6 (EA XMI UML): classifier members land in element.attrs.
    // Importers attach them in IR meta as `umlMembers`.
    const umlClassifierAttrs =
      inferredKind === 'uml' && (type === 'uml.class' || type === 'uml.interface' || type === 'uml.datatype')
        ? sanitizeUmlClassifierAttrs((el as any).meta?.umlMembers)
        : undefined;

    // BPMN2 importer attaches semantic node attributes (events, gateways, etc.) in IR `attrs`.
    // Preserve them verbatim for BPMN elements.
    const bpmnAttrs = inferredKind === 'bpmn' ? rewriteBpmnAttrs((el as any).attrs) : undefined;

    const mergedAttrs =
      umlClassifierAttrs !== undefined && bpmnAttrs !== undefined
        ? { ...(bpmnAttrs as any), ...(umlClassifierAttrs as any) }
        : umlClassifierAttrs !== undefined
          ? umlClassifierAttrs
          : bpmnAttrs;

    const domainEl: Element = {
      ...createElement({
        id: internalId,
        name: el.name ?? '',
        ...(layer ? { layer } : {}),
        type,
        documentation: el.documentation,
        ...(mergedAttrs !== undefined ? { attrs: mergedAttrs } : {})
      }),
      externalIds,
      taggedValues,
      ...(type === 'Unknown'
        ? { unknownType: { ns: sourceSystem, name: (sourceType || el.type || 'Unknown').toString() } }
        : {})
    };

    const folderId =
      el.folderId && typeof el.folderId === 'string' ? mappings.folders[el.folderId] ?? rootFolderId : rootFolderId;

    if (el.folderId && typeof el.folderId === 'string' && !mappings.folders[el.folderId]) {
      pushWarning(report, `Element "${el.name}" references missing folder "${el.folderId}" (placed at root)`);
    }

    try {
      modelStore.addElement(domainEl, folderId);
    } catch (e) {
      pushWarning(report, `Failed to add element "${el.name ?? el.id}": ${(e as Error).message}`);
    }
  }
}
