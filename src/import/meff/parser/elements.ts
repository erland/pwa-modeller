import type { ImportReport } from '../../importReport';
import type { IRElement, IRId } from '../../framework/ir';

import { addWarning, recordUnknownElementType } from '../../importReport';
import { attrAny, childText, getType, isElementNode, localName } from '../../framework/xml';
import { mapElementType } from '../../mapping/archimateTypeMapping';

import { findFirstByLocalName } from './xmlScan';
import { parsePropertiesToRecord } from './properties';
import { parseTaggedValues } from './taggedValues';

/**
 * Parse <elements> section of MEFF into IR elements.
 */
export function parseMeffElements(doc: Document, report: ImportReport, refToFolder: Map<IRId, IRId>): IRElement[] {
  const elements: IRElement[] = [];

  const elementsRoot = findFirstByLocalName(doc, ['elements']);
  if (elementsRoot) {
    for (const el of Array.from(elementsRoot.children)) {
      if (!isElementNode(el) || localName(el) !== 'element') continue;

      const id = attrAny(el, ['identifier', 'id']);
      if (!id) {
        addWarning(report, 'MEFF: Skipping an <element> without identifier.');
        continue;
      }

      const rawType = (getType(el) ?? '').trim();
      const typeRes = mapElementType(rawType, 'archimate-meff');
      if (typeRes.kind === 'unknown') recordUnknownElementType(report, typeRes.unknown);
      const typeForIr = typeRes.kind === 'known' ? typeRes.type : 'Unknown';

      const name = childText(el, 'name') ?? attrAny(el, ['name']) ?? '';
      const safeName = name.trim().length ? name.trim() : '(unnamed)';
      if (!name.trim().length) {
        addWarning(report, `MEFF: Element "${id}" is missing a name; using "(unnamed)".`);
      }
      const documentation = childText(el, 'documentation') ?? undefined;

      const folderId = refToFolder.get(id) ?? null;

      elements.push({
        id,
        type: typeForIr,
        name: safeName,
        documentation,
        folderId: folderId ?? undefined,
        properties: parsePropertiesToRecord(el),
        taggedValues: parseTaggedValues(el),
        meta: {
          source: 'archimate-meff',
          ...(typeRes.kind === 'unknown' ? { sourceType: typeRes.unknown.name } : {})
        }
      });
    }
  } else {
    addWarning(report, 'MEFF: No <elements> section found.');
  }

  return elements;
}
