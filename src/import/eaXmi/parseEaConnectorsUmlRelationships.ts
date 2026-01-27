import type { ImportReport } from '../importReport';
import type { IRExternalId, IRRelationship, IRTaggedValue } from '../framework/ir';

import { attrAny, localName } from '../framework/xml';
import { getXmiId, getXmiIdRef } from './xmi';

export type ParseEaXmiUmlConnectorRelationshipsResult = {
  relationships: IRRelationship[];
};

const EA_EXTENDER_ATTRS = ['extender'] as const;

function isEaExtension(el: Element): boolean {
  const extender = (attrAny(el, [...EA_EXTENDER_ATTRS]) ?? '').toLowerCase();
  return extender.includes('enterprise architect');
}

function findEaExtensions(doc: Document): Element[] {
  const out: Element[] = [];
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (!el) continue;
    if (localName(el) !== 'extension') continue;
    if (!isEaExtension(el)) continue;
    out.push(el);
  }
  return out;
}

function firstChildByLocalName(el: Element, ln: string): Element | undefined {
  const target = (ln ?? '').toLowerCase();
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === target) return ch;
  }
  return undefined;
}

function pickConnectorId(connector: Element): string | undefined {
  return (
    getXmiIdRef(connector) ??
    getXmiId(connector) ??
    attrAny(connector, ['connectorid', 'connectorId', 'id'])?.trim() ??
    undefined
  );
}

function pickEndpointId(endpointEl: Element | undefined): string | undefined {
  if (!endpointEl) return undefined;
  return (
    getXmiIdRef(endpointEl) ??
    getXmiId(endpointEl) ??
    attrAny(endpointEl, ['subject', 'element', 'classifier', 'start', 'end', 'ref'])?.trim() ??
    undefined
  );
}

function parseDirectionSwap(directionRaw: string | undefined): boolean {
  const d = (directionRaw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!d) return false;
  // Common EA values observed:
  //  - "Source -> Destination"
  //  - "Destination -> Source"
  //  - "Unspecified"
  if (d.includes('unspecified')) return false;
  if (d.includes('destination') && d.includes('source')) {
    // If the first mentioned endpoint is destination, assume swap.
    return /^destination\b/.test(d);
  }
  return false;
}

function inferUmlRelationshipTypeFromEaType(eaTypeRaw: string | undefined): string | undefined {
  const t = (eaTypeRaw ?? '').trim().toLowerCase();
  if (!t) return undefined;

  // EA "ea_type" values observed across exports.
  switch (t) {
    case 'association':
      return 'uml.association';
    case 'aggregation':
      return 'uml.aggregation';
    case 'composition':
      return 'uml.composition';
    case 'dependency':
      return 'uml.dependency';
    case 'realization':
      return 'uml.realization';
    case 'interfacerealization':
      return 'uml.interfaceRealization';
    case 'generalization':
      return 'uml.generalization';
    case 'include':
      return 'uml.include';
    case 'extend':
      return 'uml.extend';
    case 'controlflow':
      return 'uml.controlFlow';
    case 'objectflow':
      return 'uml.objectFlow';
    default:
      return undefined;
  }
}

function trimString(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : undefined;
}

function isProbablyArchiMateStereotype(stereotypeRaw: string | undefined): boolean {
  const s = (stereotypeRaw ?? '').trim().toLowerCase();
  return s.startsWith('archimate_');
}

function isProbablyBpmnStereotype(stereotypeRaw: string | undefined): boolean {
  const s = (stereotypeRaw ?? '').trim().toLowerCase();
  // EA BPMN stereotypes often look like "BPMN2.0_SequenceFlow" etc, but keep it conservative.
  return s.startsWith('bpmn') || s.includes('bpmn');
}

/**
 * Parse EA's <xmi:Extension><connectors> UML connectors into IR relationships.
 *
 * Why: Some EA exports represent UML connectors (including AssociationClass links)
 * primarily in the extension connector block rather than as full UML XMI relationship elements.
 */
export function parseEaXmiUmlConnectorRelationships(doc: Document, report: ImportReport): ParseEaXmiUmlConnectorRelationshipsResult {
  const relationships: IRRelationship[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const extensions = findEaExtensions(doc);
  for (const ext of extensions) {
    const connectorsEl = firstChildByLocalName(ext, 'connectors');
    if (!connectorsEl) continue;

    for (const connector of Array.from(connectorsEl.children)) {
      if (localName(connector) !== 'connector') continue;

      const propsEl = firstChildByLocalName(connector, 'properties');
      const stereotypeRaw = trimString(propsEl ? attrAny(propsEl, ['stereotype', 'stereotypes', 'xmi:stereotype']) : undefined);
      const directionRaw = trimString(propsEl ? attrAny(propsEl, ['direction']) : undefined);
      const eaTypeRaw = trimString(propsEl ? attrAny(propsEl, ['ea_type', 'eaType', 'type']) : undefined);

      // Don't interfere with ArchiMate/BPMN connector parsing.
      if (isProbablyArchiMateStereotype(stereotypeRaw) || isProbablyBpmnStereotype(stereotypeRaw)) {
        continue;
      }

      // AssociationClass linkage sometimes exists even when ea_type is "Association".
      const extPropsEl = firstChildByLocalName(connector, 'extendedproperties');
      const associationClassRef = trimString(extPropsEl ? attrAny(extPropsEl, ['associationclass', 'associationClass']) : undefined);

      const inferredType = inferUmlRelationshipTypeFromEaType(eaTypeRaw);
      // Only import connectors we can type as UML, OR those that explicitly reference an association class.
      if (!inferredType && !associationClassRef) {
        continue;
      }

      const idDirect = pickConnectorId(connector);
      let id = idDirect?.trim();
      if (!id) {
        synthCounter++;
        id = `eaUmlConnectorRel_synth_${synthCounter}`;
        report.warnings.push(`EA XMI: UML connector relationship missing id; generated synthetic relationship id "${id}".`);
      }

      if (seen.has(id)) {
        report.warnings.push(`EA XMI: Duplicate UML connector relationship id "${id}" encountered; skipping subsequent occurrence.`);
        continue;
      }
      seen.add(id);

      const sourceEl = firstChildByLocalName(connector, 'source');
      const targetEl = firstChildByLocalName(connector, 'target');
      let sourceId = pickEndpointId(sourceEl);
      let targetId = pickEndpointId(targetEl);

      if (!sourceId || !targetId) {
        report.warnings.push(
          `EA XMI: Skipped UML connector relationship "${id}" because endpoints could not be resolved (source=${sourceId ?? '∅'}, target=${targetId ?? '∅'}).`
        );
        continue;
      }

      // Some exports encode the direction as "Destination -> Source".
      if (parseDirectionSwap(directionRaw)) {
        const tmp = sourceId;
        sourceId = targetId;
        targetId = tmp;
      }

      const type = inferredType ?? 'uml.association';
      const name = trimString(attrAny(connector, ['name', 'label']));

      const externalIds: IRExternalId[] = [];
      if (idDirect) externalIds.push({ system: 'xmi', id: idDirect, kind: 'xmi-id' });

      const taggedValues: IRTaggedValue[] = [];
      if (stereotypeRaw) taggedValues.push({ key: 'stereotype', value: stereotypeRaw });
      if (eaTypeRaw) taggedValues.push({ key: 'ea_type', value: eaTypeRaw });
      if (directionRaw) taggedValues.push({ key: 'direction', value: directionRaw });
      if (associationClassRef) taggedValues.push({ key: 'associationclass', value: associationClassRef });

      const attrs: Record<string, unknown> | undefined = associationClassRef
        ? { associationClassElementId: associationClassRef }
        : undefined;

      relationships.push({
        id,
        type,
        sourceId,
        targetId,
        ...(name ? { name } : {}),
        ...(attrs ? { attrs } : {}),
        ...(externalIds.length ? { externalIds } : {}),
        ...(taggedValues.length ? { taggedValues } : {}),
        meta: {
          eaConnector: true,
          ...(stereotypeRaw ? { eaStereotype: stereotypeRaw } : {}),
          ...(directionRaw ? { eaDirection: directionRaw } : {}),
          ...(eaTypeRaw ? { eaType: eaTypeRaw } : {}),
          ...(associationClassRef ? { associationClassRef: associationClassRef } : {}),
        }
      });
    }
  }

  return { relationships };
}
