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

  const isStringId = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

  const mapBpmnRefStrict = (opts: {
    ownerId: string;
    ownerName?: string;
    field: string;
    ref: unknown;
  }): { mapped?: string; unresolved?: string } => {
    const { ownerId, ownerName, field, ref } = opts;
    if (!isStringId(ref)) return {};
    const mapped = mappings.elements[ref];
    if (mapped) return { mapped };
    // Reference points to an element that was not imported. Keep a warning and record it.
    pushWarning(
      report,
      `BPMN: element "${ownerName ?? ownerId}" has unresolved reference ${field}="${ref}" (cleared)`
    );
    return { unresolved: ref };
  };

  const rewriteBpmnAttrs = (opts: { ownerId: string; ownerName?: string; attrs: unknown }): unknown => {
    const { ownerId, ownerName, attrs } = opts;
    if (!attrs || typeof attrs !== 'object') return attrs;

    const a: any = { ...(attrs as any) };
    const unresolvedRefs: Record<string, unknown> = {};

    const rewriteField = (field: string) => {
      if (!isStringId(a[field])) return;
      const { mapped, unresolved } = mapBpmnRefStrict({ ownerId, ownerName, field, ref: a[field] });
      if (mapped) a[field] = mapped;
      else if (unresolved) {
        delete a[field];
        unresolvedRefs[field] = unresolved;
      }
    };

    // Boundary events attach to a host activity/task.
    rewriteField('attachedToRef');

    // Data references point to global definitions.
    rewriteField('dataObjectRef');
    rewriteField('dataStoreRef');

    // Participant pools may reference the owning process.
    rewriteField('processRef');

    // Lane containment: translate flow node references to internal element ids.
    if (Array.isArray(a.flowNodeRefs)) {
      const kept: string[] = [];
      const dropped: string[] = [];
      for (const r of a.flowNodeRefs as unknown[]) {
        const { mapped, unresolved } = mapBpmnRefStrict({ ownerId, ownerName, field: 'flowNodeRefs', ref: r });
        if (mapped) kept.push(mapped);
        else if (unresolved) dropped.push(unresolved);
      }
      if (kept.length) a.flowNodeRefs = kept;
      else delete a.flowNodeRefs;
      if (dropped.length) unresolvedRefs.flowNodeRefs = dropped;
    }

    // Event definitions may reference global BPMN definitions.
    const ed = a.eventDefinition;
    if (ed && typeof ed === 'object') {
      const ed2: any = { ...(ed as any) };

      const rewriteEd = (field: 'messageRef' | 'signalRef' | 'errorRef' | 'escalationRef') => {
        if (!isStringId(ed2[field])) return;
        const { mapped, unresolved } = mapBpmnRefStrict({
          ownerId,
          ownerName,
          field: `eventDefinition.${field}`,
          ref: ed2[field]
        });
        if (mapped) ed2[field] = mapped;
        else if (unresolved) {
          delete ed2[field];
          unresolvedRefs[`eventDefinition.${field}`] = unresolved;
        }
      };

      rewriteEd('messageRef');
      rewriteEd('signalRef');
      rewriteEd('errorRef');
      rewriteEd('escalationRef');

      a.eventDefinition = ed2;
    }

    // Gateway default flow may reference a sequenceFlow relationship id, which is not an element.
    // We intentionally do not rewrite defaultFlowRef here.

    if (Object.keys(unresolvedRefs).length) {
      // Non-schema field that we keep purely for diagnostics and UI/validation.
      a.unresolvedRefs = unresolvedRefs;
    }
    return a;
  };

  const rewriteUmlAttrs = (opts: { ownerId: string; ownerName?: string; attrs: unknown }): unknown => {
    const { ownerId, ownerName, attrs } = opts;
    if (!attrs || typeof attrs !== 'object') return attrs;

    const a: any = { ...(attrs as any) };
    const unresolvedRefs: Record<string, unknown> = {};

    const rewriteField = (field: string) => {
      if (!isStringId(a[field])) return;
      const mapped = mappings.elements[a[field]];
      if (mapped) a[field] = mapped;
      else {
        unresolvedRefs[field] = a[field];
        delete a[field];
      }
    };

    // Step 3 (UML Activity): normalize ownership refs.
    rewriteField('activityId');

    if (Array.isArray(a.ownedNodeRefs)) {
      const kept: string[] = [];
      const dropped: string[] = [];
      for (const r of a.ownedNodeRefs as unknown[]) {
        if (!isStringId(r)) continue;
        const mapped = mappings.elements[r];
        if (mapped) kept.push(mapped);
        else dropped.push(r);
      }
      if (kept.length) a.ownedNodeRefs = kept;
      else delete a.ownedNodeRefs;
      if (dropped.length) unresolvedRefs.ownedNodeRefs = dropped;
    }

    if (Object.keys(unresolvedRefs).length) {
      a.unresolvedRefs = { ...(a.unresolvedRefs ?? {}), ...unresolvedRefs };
      pushWarning(report, `UML: element "${ownerName ?? ownerId}" has unresolved references in attrs (some fields cleared)`);
    }

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

    // UML importers may attach semantic/ownership attributes in IR `attrs`.
    const umlAttrs =
      inferredKind === 'uml'
        ? rewriteUmlAttrs({ ownerId: el.id, ownerName: el.name ?? undefined, attrs: (el as any).attrs })
        : undefined;

    // BPMN2 importer attaches semantic node attributes (events, gateways, etc.) in IR `attrs`.
    // Preserve them verbatim for BPMN elements.
    const bpmnAttrs =
      inferredKind === 'bpmn'
        ? rewriteBpmnAttrs({ ownerId: el.id, ownerName: el.name ?? undefined, attrs: (el as any).attrs })
        : undefined;

    const mergedAttrs =
      umlClassifierAttrs !== undefined && bpmnAttrs !== undefined && umlAttrs !== undefined
        ? { ...(bpmnAttrs as any), ...(umlClassifierAttrs as any), ...(umlAttrs as any) }
        : umlClassifierAttrs !== undefined && bpmnAttrs !== undefined
          ? { ...(bpmnAttrs as any), ...(umlClassifierAttrs as any) }
          : umlClassifierAttrs !== undefined && umlAttrs !== undefined
            ? { ...(umlClassifierAttrs as any), ...(umlAttrs as any) }
            : bpmnAttrs !== undefined && umlAttrs !== undefined
              ? { ...(bpmnAttrs as any), ...(umlAttrs as any) }
              : umlClassifierAttrs !== undefined
                ? umlClassifierAttrs
                : bpmnAttrs !== undefined
                  ? bpmnAttrs
                  : umlAttrs;

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
