import type { ApplyImportContext } from '../applyImportTypes';
import type { Relationship, RelationshipType, ModelKind } from '../../../domain';
import { createId, createRelationship, kindFromTypeId } from '../../../domain';
import { sanitizeRelationshipAttrs } from '../../../domain/relationshipAttrs';
import { modelStore } from '../../../store';
import { pushWarning, resolveRelationshipType, toExternalIds, toTaggedValues } from '../applyImportHelpers';

export function applyRelationships(ctx: ApplyImportContext): void {
  const { ir, sourceSystem, report, unknownTypePolicy, mappings } = ctx;

  const isStringId = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

  const mapBpmnElementRefStrict = (opts: {
    ownerRelId: string;
    field: string;
    ref: unknown;
  }): { mapped?: string; unresolved?: string } => {
    const { ownerRelId, field, ref } = opts;
    if (!isStringId(ref)) return {};
    const mapped = mappings.elements[ref];
    if (mapped) return { mapped };
    pushWarning(report, `BPMN: relationship "${ownerRelId}" has unresolved reference ${field}="${ref}" (cleared)`);
    return { unresolved: ref };
  };

  const rewriteBpmnRelAttrs = (opts: { ownerRelId: string; attrs: unknown }): unknown => {
    const { ownerRelId, attrs } = opts;
    if (!attrs || typeof attrs !== 'object') return attrs;
    const a: any = { ...(attrs as any) };
    const unresolvedRefs: Record<string, unknown> = {};

    // Message flow can reference a global message definition.
    if (isStringId(a.messageRef)) {
      const { mapped, unresolved } = mapBpmnElementRefStrict({ ownerRelId, field: 'messageRef', ref: a.messageRef });
      if (mapped) a.messageRef = mapped;
      else if (unresolved) {
        delete a.messageRef;
        unresolvedRefs.messageRef = unresolved;
      }
    }

    if (Object.keys(unresolvedRefs).length) {
      a.unresolvedRefs = unresolvedRefs;
    }
    return a;
  };

  for (const rel of ir.relationships ?? []) {
    if (!rel?.id) continue;

    const sourceType = (typeof rel.meta?.sourceType === 'string' ? (rel.meta.sourceType as string) : rel.type) ?? '';
    const inferredKind: ModelKind = kindFromTypeId(sourceType || rel.type);
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

    const resolved = isNonArchimate
      ? { kind: 'known' as const, type: (sourceType || rel.type) as RelationshipType }
      : resolveRelationshipType(sourceType || rel.type);

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

    const umlAttrsFromMeta =
      rel.meta && typeof rel.meta === 'object' && 'umlAttrs' in (rel.meta as Record<string, unknown>)
        ? (rel.meta as Record<string, unknown>).umlAttrs
        : undefined;

    // Step 5 (UML Activity properties): allow importers to provide
    // general UML relationship attributes via IR `attrs` (e.g. guard on ControlFlow).
    const umlAttrsFromIr = inferredKind === 'uml' ? (rel as any).attrs : undefined;

    const umlMergedAttrs =
      umlAttrsFromMeta !== undefined && umlAttrsFromIr !== undefined
        ? ({ ...(umlAttrsFromIr as any), ...(umlAttrsFromMeta as any) } as Record<string, unknown>)
        : umlAttrsFromMeta !== undefined
          ? umlAttrsFromMeta
          : umlAttrsFromIr;

    const umlSanitized = umlMergedAttrs !== undefined ? sanitizeRelationshipAttrs(type, umlMergedAttrs) : undefined;

    // BPMN2 importer attaches relationship semantics (e.g. conditionExpression, messageRef) in IR `attrs`.
    const bpmnAttrs = inferredKind === 'bpmn' ? rewriteBpmnRelAttrs({ ownerRelId: rel.id, attrs: (rel as any).attrs }) : undefined;

    const attrs =
      umlSanitized !== undefined && bpmnAttrs !== undefined
        ? { ...(bpmnAttrs as any), ...(umlSanitized as any) }
        : umlSanitized !== undefined
          ? umlSanitized
          : bpmnAttrs;

    const domainRel: Relationship = {
      ...createRelationship({
        id: internalId,
        sourceElementId: src,
        targetElementId: tgt,
        type,
        name: rel.name,
        documentation: rel.documentation,
        ...(attrs !== undefined ? { attrs } : {})
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
}
