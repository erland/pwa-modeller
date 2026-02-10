import type { ApplyImportContext } from '../../applyImportTypes';
import type { ArchimateLayer, Element, ElementType, ModelKind } from '../../../../domain';
import { createElement, createId, kindFromTypeId } from '../../../../domain';
import { sanitizeUmlClassifierAttrs } from '../../../../domain/uml/members';
import {
  guessLayerFromTypeString,
  pushWarning,
  resolveElementType,
  toExternalIds,
  toTaggedValues
} from '../../applyImportHelpers';
import { mapParentElementId, rewriteBpmnAttrs, rewriteUmlAttrs } from './rewriteElementAttrs';
import type { ElementApplyPlan, ElementApplyPlanItem } from './elementApplyTypes';

export function buildElementApplyPlan(ctx: ApplyImportContext): ElementApplyPlan {
  const { ir, sourceSystem, report, unknownTypePolicy, rootFolderId, mappings } = ctx;

  const items: ElementApplyPlanItem[] = [];

  for (const el of ir.elements ?? []) {
    if (!el?.id) continue;

    // Importers may canonicalize `el.type` to 'Unknown' and keep the original token in meta.
    // Prefer the original token when present.
    const sourceType = (typeof el.meta?.sourceType === 'string' ? (el.meta.sourceType as string) : el.type) ?? '';
    const inferredKind: ModelKind = kindFromTypeId(sourceType || el.type);

    // For UML/BPMN (qualified) types, preserve the type string directly.
    const isNonArchimate = inferredKind !== 'archimate';

    const resolved = isNonArchimate
      ? {
          kind: 'known' as const,
          type: (sourceType || el.type) as ElementType,
          layer: undefined as unknown as ArchimateLayer
        }
      : resolveElementType(sourceType);

    if (!isNonArchimate && resolved.kind === 'unknown' && unknownTypePolicy === 'skip') {
      pushWarning(report, `Skipped element with unknown type "${sourceType || el.type}": ${el.name ?? el.id}`);
      continue;
    }

    const internalId = mappings.elements[el.id] ?? createId('el');
    mappings.elements[el.id] = internalId;

    const externalIds = toExternalIds(el.externalIds, sourceSystem, el.id);
    const taggedValues = toTaggedValues(el.taggedValues, sourceSystem);

    const parentElementId = mapParentElementId({
      ctx,
      ownerId: el.id,
      ownerName: el.name ?? undefined,
      parentRef: (el as any).parentElementId
    });

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
      inferredKind === 'uml' &&
      (type === 'uml.class' || type === 'uml.associationClass' || type === 'uml.interface' || type === 'uml.datatype')
        ? sanitizeUmlClassifierAttrs((el as any).meta?.umlMembers)
        : undefined;

    const umlAttrs =
      inferredKind === 'uml'
        ? rewriteUmlAttrs({ ctx, ownerId: el.id, ownerName: el.name ?? undefined, attrs: (el as any).attrs })
        : undefined;

    const bpmnAttrs =
      inferredKind === 'bpmn'
        ? rewriteBpmnAttrs({ ctx, ownerId: el.id, ownerName: el.name ?? undefined, attrs: (el as any).attrs })
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

    const element: Element = {
      ...createElement({
        id: internalId,
        name: el.name ?? '',
        ...(parentElementId ? { parentElementId } : {}),
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

    const folderId = el.folderId && typeof el.folderId === 'string' ? mappings.folders[el.folderId] ?? rootFolderId : rootFolderId;

    if (el.folderId && typeof el.folderId === 'string' && !mappings.folders[el.folderId]) {
      pushWarning(report, `Element "${el.name}" references missing folder "${el.folderId}" (placed at root)`);
    }

    items.push({ irId: el.id, element, folderId });
  }

  return { items };
}
