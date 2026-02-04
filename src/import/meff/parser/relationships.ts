import type { ImportReport } from '../../importReport';
import type { IRRelationship } from '../../framework/ir';

import { addWarning, recordUnknownRelationshipType } from '../../importReport';
import { attrAny, childText, getType, isElementNode, localName } from '../../framework/xml';
import { mapRelationshipType } from '../../mapping/archimateTypeMapping';

import { findFirstByLocalName } from './xmlScan';
import { parsePropertiesToRecord } from './properties';
import { parseTaggedValues } from './taggedValues';

function stripNamespace(raw: string): string {
  const s = (raw ?? '').trim();
  const lastColon = s.lastIndexOf(':');
  const lastDot = s.lastIndexOf('.');
  const lastHash = s.lastIndexOf('#');
  const cut = Math.max(lastColon, lastDot, lastHash);
  return cut >= 0 ? s.slice(cut + 1) : s;
}

function normalizeKey(raw: string): string {
  return (raw ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Compatibility: some exporters still emit UsedByRelationship in MEFF.
 * We import it as Serving and invert direction (A UsedBy B -> B Serving A).
 */
function isUsedByRelationship(rawType: string): boolean {
  const key = normalizeKey(stripNamespace(rawType));
  // Accept: UsedByRelationship, UsedBy, UsedByRel, etc.
  return key === 'usedbyrelationship' || key === 'usedby';
}

/**
 * Parse <relationships> section of MEFF into IR relationships.
 */
export function parseMeffRelationships(doc: Document, report: ImportReport): IRRelationship[] {
  const relationships: IRRelationship[] = [];

  const relRoot = findFirstByLocalName(doc, ['relationships']);
  if (relRoot) {
    for (const el of Array.from(relRoot.children)) {
      if (!isElementNode(el) || localName(el) !== 'relationship') continue;

      const id = attrAny(el, ['identifier', 'id']);
      if (!id) {
        addWarning(report, 'MEFF: Skipping a <relationship> without identifier.');
        continue;
      }

      const rawType = (getType(el) ?? '').trim();
      const usedByCompat = isUsedByRelationship(rawType);

      // Map type: UsedByRelationship -> Serving (direction inversion handled below).
      const typeRes = usedByCompat ? { kind: 'known' as const, type: 'Serving' as const } : mapRelationshipType(rawType, 'archimate-meff');
      if (!usedByCompat && typeRes.kind === 'unknown') recordUnknownRelationshipType(report, typeRes.unknown);
      const typeForIr = typeRes.kind === 'known' ? typeRes.type : 'Unknown';

      const rawSourceId =
        attrAny(el, ['source', 'sourceRef', 'sourceref', 'from']) ?? childText(el, 'source') ?? childText(el, 'sourceRef');
      const rawTargetId =
        attrAny(el, ['target', 'targetRef', 'targetref', 'to']) ?? childText(el, 'target') ?? childText(el, 'targetRef');

      // If we are importing UsedByCompatibility, invert direction when converting to Serving.
      const sourceId = usedByCompat ? rawTargetId : rawSourceId;
      const targetId = usedByCompat ? rawSourceId : rawTargetId;

      if (!sourceId || !targetId) {
        addWarning(report, `MEFF: Relationship "${id}" is missing source/target; skipped.`);
        continue;
      }

      const name = childText(el, 'name') ?? attrAny(el, ['name']) ?? undefined;
      const documentation = childText(el, 'documentation') ?? undefined;

      relationships.push({
        id,
        type: typeForIr,
        name,
        documentation,
        sourceId,
        targetId,
        properties: parsePropertiesToRecord(el),
        taggedValues: parseTaggedValues(el),
        meta: {
          source: 'archimate-meff',
          // IMPORTANT: `applyImportIR` prefers `meta.sourceType` over `rel.type` when resolving
          // relationship types. For compatibility rewrites (UsedBy -> Serving) we *must not*
          // set `sourceType` to the original MEFF type, otherwise the relationship will be
          // resolved as Unknown and reported as such.
          ...(usedByCompat
            ? { originalType: stripNamespace(rawType) || rawType, compat: 'UsedByRelationship→Serving(inverse)' }
            : {}),
          ...(!usedByCompat && typeRes.kind === 'unknown' ? { sourceType: typeRes.unknown.name } : {})
        }
      });
    }
  } else {
    addWarning(report, 'MEFF: No <relationships> section found.');
  }

  return relationships;
}
