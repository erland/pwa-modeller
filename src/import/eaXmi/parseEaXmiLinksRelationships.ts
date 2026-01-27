import { addIssue } from '../importReport';
import type { ImportReport } from '../importReport';
import type { IRExternalId, IRRelationship } from '../framework/ir';
import { attrAny, localName, qa } from '../framework/xml';

type ParseEaXmiLinksRelationshipsResult = {
  relationships: IRRelationship[];
};

const EA_LINK_ID_ATTRS = ['xmi:id', 'id', 'ea_guid', 'ea:guid', 'guid', 'uuid'] as const;
const EA_LINK_NAME_ATTRS = ['name', 'label', 'role'] as const;

const EA_LINK_START_ATTRS = ['start', 'startid', 'start_id', 'source', 'sourceid', 'source_id', 'client', 'from'] as const;
const EA_LINK_END_ATTRS = ['end', 'endid', 'end_id', 'target', 'targetid', 'target_id', 'supplier', 'to'] as const;

function mapLinkTypeToRelationshipType(linkLocalName: string): string {
  const ln = (linkLocalName || '').toLowerCase();
  switch (ln) {
    case 'notelink':
      return 'uml.noteLink';
    case 'informationflow':
      return 'uml.informationFlow';
    case 'dependency':
      return 'uml.dependency';
    case 'abstraction':
      return 'uml.abstraction';
    case 'realization':
    case 'realisation':
      return 'uml.realization';
    case 'association':
      return 'uml.association';
    case 'aggregation':
      return 'uml.aggregation';
    case 'composition':
      return 'uml.composition';
    default:
      // Best-effort: keep it under the uml.* namespace so downstream rendering can at least treat it as UML-ish.
      return `uml.${ln}`;
  }
}

/**
 * Step 6.5: Parse EA "links" blocks.
 *
 * Older EA XMI exports often store relationships inside <element> records using:
 *   <links><InformationFlow … start="…" end="…"/></links>
 *
 * These are useful for:
 * - ensuring we have a relationship record for diagram connectors referenced by EAID_* ids
 * - allowing view normalization to resolve relationshipIds reliably
 */
export function parseEaXmiLinksRelationships(doc: Document, report: ImportReport): ParseEaXmiLinksRelationshipsResult {
  const relById = new Map<string, IRRelationship>();

  const linksBlocks = qa(doc, 'links');
  for (const links of linksBlocks) {
    for (const child of Array.from(links.children)) {
      const ln = localName(child);
      if (!ln) continue;

      const id = attrAny(child, [...EA_LINK_ID_ATTRS])?.trim();
      if (!id) continue;

      const start = attrAny(child, [...EA_LINK_START_ATTRS])?.trim();
      const end = attrAny(child, [...EA_LINK_END_ATTRS])?.trim();
      if (!start || !end) continue;

      if (relById.has(id)) continue;

      const name = attrAny(child, [...EA_LINK_NAME_ATTRS])?.trim();

      const externalIds: IRExternalId[] = [];
      const guid = attrAny(child, ['ea_guid', 'ea:guid', 'guid', 'uuid'])?.trim();
      const xmiId = attrAny(child, ['xmi:id'])?.trim();
      if (xmiId && xmiId !== id) externalIds.push({ system: 'xmi', id: xmiId, kind: 'xmi-id' });
      if (guid && guid !== id) externalIds.push({ system: 'sparx-ea', id: guid, kind: 'guid' });

      relById.set(id, {
        id,
        type: mapLinkTypeToRelationshipType(ln),
        ...(name ? { name } : {}),
        sourceId: start,
        targetId: end,
        ...(externalIds.length ? { externalIds } : {}),
        meta: {
          sourceSystem: 'sparx-ea',
          source: 'links',
          eaLinkType: ln
        }
      });
    }
  }

  if (relById.size) {
    addIssue(report, { level: 'info', code: 'ea-xmi:links-parsed', message: `EA XMI: Parsed ${relById.size} relationship(s) from <links> blocks.` });
  }

  return { relationships: Array.from(relById.values()) };
}