import type { ImportReport } from '../../importReport';
import type { IRRelationship } from '../../framework/ir';

import { addWarning, recordUnknownRelationshipType } from '../../importReport';
import { attrAny, childText, getType, isElementNode, localName } from '../../framework/xml';
import { mapRelationshipType } from '../../mapping/archimateTypeMapping';

import { findFirstByLocalName } from './xmlScan';
import { parsePropertiesToRecord } from './properties';
import { parseTaggedValues } from './taggedValues';

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
      const typeRes = mapRelationshipType(rawType, 'archimate-meff');
      if (typeRes.kind === 'unknown') recordUnknownRelationshipType(report, typeRes.unknown);
      const typeForIr = typeRes.kind === 'known' ? typeRes.type : 'Unknown';

      const sourceId =
        attrAny(el, ['source', 'sourceRef', 'sourceref', 'from']) ?? childText(el, 'source') ?? childText(el, 'sourceRef');
      const targetId =
        attrAny(el, ['target', 'targetRef', 'targetref', 'to']) ?? childText(el, 'target') ?? childText(el, 'targetRef');

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
          ...(typeRes.kind === 'unknown' ? { sourceType: typeRes.unknown.name } : {})
        }
      });
    }
  } else {
    addWarning(report, 'MEFF: No <relationships> section found.');
  }

  return relationships;
}
