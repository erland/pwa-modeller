import type { ImportReport } from '../importReport';
import type { IRExternalId, IRRelationship, IRTaggedValue } from '../framework/ir';

import { attrAny, localName } from '../framework/xml';
import { inferArchimateRelationshipTypeFromEaProfileTagLocalName } from './mapping';
import { getXmiId, getXmiIdRef } from './xmi';

export type ParseEaXmiConnectorRelationshipsResult = {
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

function firstChildByLocalName(el: Element, ln: string): Element | undefined {
  const target = (ln ?? '').toLowerCase();
  for (const ch of Array.from(el.children)) {
    if (localName(ch) === target) return ch;
  }
  return undefined;
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

/**
 * Step 1 (EA XMI ArchiMate): Parse EA's <connectors> extension block into IR relationships.
 *
 * Why: In many EA exports, the "real" ArchiMate relationship type is only available as
 * <properties stereotype="ArchiMate_*"> inside <xmi:Extension><connectors>.
 */
export function parseEaXmiArchiMateConnectorRelationships(doc: Document, report: ImportReport): ParseEaXmiConnectorRelationshipsResult {
  const relationships: IRRelationship[] = [];
  const seen = new Set<string>();
  let synthCounter = 0;

  const extensions = findEaExtensions(doc);
  for (const ext of extensions) {
    // EA typically stores connectors under: <xmi:Extension><connectors><connector … /></connectors></xmi:Extension>
    const connectorsEl = firstChildByLocalName(ext, 'connectors');
    if (!connectorsEl) continue;

    for (const connector of Array.from(connectorsEl.children)) {
      if (localName(connector) !== 'connector') continue;

      const idDirect = pickConnectorId(connector);
      let id = idDirect?.trim();
      if (!id) {
        synthCounter++;
        id = `eaConnectorRel_synth_${synthCounter}`;
        report.warnings.push(
          `EA XMI: Connector relationship missing id; generated synthetic relationship id "${id}".`
        );
      }

      if (seen.has(id)) {
        report.warnings.push(`EA XMI: Duplicate connector relationship id "${id}" encountered; skipping subsequent occurrence.`);
        continue;
      }
      seen.add(id);

      const sourceEl = firstChildByLocalName(connector, 'source');
      const targetEl = firstChildByLocalName(connector, 'target');
      let sourceId = pickEndpointId(sourceEl);
      let targetId = pickEndpointId(targetEl);

      if (!sourceId || !targetId) {
        report.warnings.push(
          `EA XMI: Skipped connector relationship "${id}" because endpoints could not be resolved (source=${sourceId ?? '∅'}, target=${targetId ?? '∅'}).`
        );
        continue;
      }

      const propsEl = firstChildByLocalName(connector, 'properties');
      const stereotypeRaw = (propsEl ? attrAny(propsEl, ['stereotype', 'stereotypes', 'xmi:stereotype']) : undefined)?.trim();
      const directionRaw = (propsEl ? attrAny(propsEl, ['direction']) : undefined)?.trim();
      const eaTypeRaw = (propsEl ? attrAny(propsEl, ['ea_type', 'eaType', 'type']) : undefined)?.trim();

      const inferred = stereotypeRaw ? inferArchimateRelationshipTypeFromEaProfileTagLocalName(stereotypeRaw) : undefined;

      // Only treat connectors as ArchiMate when the stereotype clearly indicates ArchiMate.
      // Otherwise (e.g. plain UML connectors with ea_type="Association"), skip here and let UML connector parsing handle it.
      if (!stereotypeRaw || !stereotypeRaw.toLowerCase().startsWith('archimate_')) {
        continue;
      }

      const type = inferred ?? 'Unknown';
      if (!inferred) {
        report.warnings.push(
          `EA XMI: Connector relationship "${id}" has unmapped stereotype "${stereotypeRaw ?? '∅'}"; imported as type "Unknown".`
        );
      }

      // Some exports encode the direction as "Destination -> Source".
      if (parseDirectionSwap(directionRaw)) {
        const tmp = sourceId;
        sourceId = targetId;
        targetId = tmp;
      }

      const name = (attrAny(connector, ['name', 'label']) ?? '').trim() || undefined;

      const externalIds: IRExternalId[] = [];
      if (idDirect) externalIds.push({ system: 'xmi', id: idDirect, kind: 'xmi-id' });

      const taggedValues: IRTaggedValue[] = [];
      if (stereotypeRaw) taggedValues.push({ key: 'stereotype', value: stereotypeRaw });
      if (eaTypeRaw) taggedValues.push({ key: 'ea_type', value: eaTypeRaw });
      if (directionRaw) taggedValues.push({ key: 'direction', value: directionRaw });

      relationships.push({
        id,
        type,
        sourceId,
        targetId,
        ...(name ? { name } : {}),
        ...(externalIds.length ? { externalIds } : {}),
        ...(taggedValues.length ? { taggedValues } : {}),
        meta: {
          eaConnector: true,
          ...(stereotypeRaw ? { eaStereotype: stereotypeRaw } : {}),
          ...(directionRaw ? { eaDirection: directionRaw } : {}),
          ...(eaTypeRaw ? { eaType: eaTypeRaw } : {}),
        },
      });
    }
  }

  return { relationships };
}
