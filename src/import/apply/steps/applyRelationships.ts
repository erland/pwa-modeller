import type { ApplyImportContext } from '../applyImportTypes';
import type { Relationship, RelationshipType, ModelKind } from '../../../domain';
import { createId, createRelationship, kindFromTypeId } from '../../../domain';
import { sanitizeRelationshipAttrs } from '../../../domain/relationshipAttrs';
import { modelStore } from '../../../store';
import { pushWarning, resolveRelationshipType, toExternalIds, toTaggedValues } from '../applyImportHelpers';

export function applyRelationships(ctx: ApplyImportContext): void {
  const { ir, sourceSystem, report, unknownTypePolicy, mappings } = ctx;

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

    const umlAttrs =
      rel.meta && typeof rel.meta === 'object' && 'umlAttrs' in (rel.meta as Record<string, unknown>)
        ? (rel.meta as Record<string, unknown>).umlAttrs
        : undefined;
    const attrs = umlAttrs !== undefined ? sanitizeRelationshipAttrs(type, umlAttrs) : undefined;

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
