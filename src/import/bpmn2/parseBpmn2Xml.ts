import type { ImportIR } from '../framework/importer';
import type { IRElement, IRRelationship } from '../framework/ir';

import { attr, childByLocalName, localName, parseXml, q, qa, text } from './xml';

export type ParseBpmn2Result = {
  importIR: ImportIR;
  warnings: string[];
};

function bpmnTypeForNodeLocalName(nameLc: string): string | null {
  switch (nameLc) {
    // Containers
    case 'participant':
      return 'bpmn.pool';
    case 'lane':
      return 'bpmn.lane';

    // Activities
    case 'task':
      return 'bpmn.task';
    case 'usertask':
      return 'bpmn.userTask';
    case 'servicetask':
      return 'bpmn.serviceTask';
    case 'scripttask':
      return 'bpmn.scriptTask';
    case 'manualtask':
      return 'bpmn.manualTask';
    case 'callactivity':
      return 'bpmn.callActivity';
    case 'subprocess':
      return 'bpmn.subProcess';

    // Events
    case 'startevent':
      return 'bpmn.startEvent';
    case 'endevent':
      return 'bpmn.endEvent';
    case 'intermediatecatchevent':
      return 'bpmn.intermediateCatchEvent';
    case 'intermediatethrowevent':
      return 'bpmn.intermediateThrowEvent';
    case 'boundaryevent':
      return 'bpmn.boundaryEvent';

    // Gateways
    case 'exclusivegateway':
      return 'bpmn.gatewayExclusive';
    case 'parallelgateway':
      return 'bpmn.gatewayParallel';
    case 'inclusivegateway':
      return 'bpmn.gatewayInclusive';
    case 'eventbasedgateway':
      return 'bpmn.gatewayEventBased';

    // Artifacts (minimal support; helpful for association)
    case 'textannotation':
      return 'bpmn.textAnnotation';
    case 'dataobjectreference':
      return 'bpmn.dataObjectReference';
    case 'datastorereference':
      return 'bpmn.dataStoreReference';
    case 'group':
      return 'bpmn.group';

    default:
      return null;
  }
}

function bpmnTypeForRelLocalName(nameLc: string): string | null {
  switch (nameLc) {
    case 'sequenceflow':
      return 'bpmn.sequenceFlow';
    case 'messageflow':
      return 'bpmn.messageFlow';
    case 'association':
      return 'bpmn.association';
    default:
      return null;
  }
}

function defaultName(typeId: string, id: string): string {
  // Names are required by the domain factories, so always provide a fallback.
  const short = typeId.replace(/^bpmn\./, '');
  return `${short} (${id})`;
}

/**
 * Parse BPMN 2.0 XML into the app's ImportIR.
 *
 * Step 1 skeleton: validates that the document contains a <definitions> root.
 * Later steps will populate elements, relationships, views and geometry.
 */
export function parseBpmn2Xml(xmlText: string): ParseBpmn2Result {
  const warnings: string[] = [];
  const doc = parseXml(xmlText);

  const defs = q(doc, 'definitions');
  if (!defs || localName(defs) !== 'definitions') {
    throw new Error('Not a BPMN 2.0 XML document: missing <definitions> element.');
  }

  const elements: IRElement[] = [];
  const relationships: IRRelationship[] = [];

  const idIndex = new Set<string>();
  const unsupportedNodeTypes = new Set<string>();

  // ------------------------------
  // Nodes (elements)
  // ------------------------------
  // We intentionally keep this permissive: collect supported node types anywhere in <definitions>.
  // Later steps can refine containment (process/pool/lane) and add DI-based view layout.
  const supportedNodeLocalNames = [
    // Containers
    'participant',
    'lane',
    // Activities
    'task',
    'userTask',
    'serviceTask',
    'scriptTask',
    'manualTask',
    'callActivity',
    'subProcess',
    // Events
    'startEvent',
    'endEvent',
    'intermediateCatchEvent',
    'intermediateThrowEvent',
    'boundaryEvent',
    // Gateways
    'exclusiveGateway',
    'parallelGateway',
    'inclusiveGateway',
    'eventBasedGateway',
    // Artifacts
    'textAnnotation',
    'dataObjectReference',
    'dataStoreReference',
    'group'
  ];

  for (const ln of supportedNodeLocalNames) {
    for (const el of qa(defs, ln)) {
      const id = (attr(el, 'id') ?? '').trim();
      if (!id) {
        warnings.push(`Skipping BPMN element without @id (<${localName(el)}>)`);
        continue;
      }

      const typeId = bpmnTypeForNodeLocalName(localName(el));
      if (!typeId) {
        // Shouldn't happen because we only query supported names, but keep defensive.
        const key = localName(el);
        if (!unsupportedNodeTypes.has(key)) {
          unsupportedNodeTypes.add(key);
          warnings.push(`Unsupported BPMN node element <${key}> (skipped)`);
        }
        continue;
      }

      if (idIndex.has(id)) {
        // Avoid duplicates across different traversals.
        continue;
      }
      idIndex.add(id);

      const name = (attr(el, 'name') ?? '').trim() || defaultName(typeId, id);
      const docEl = childByLocalName(el, 'documentation');
      const documentation = text(docEl) || undefined;

      elements.push({
        id,
        type: typeId,
        name,
        documentation,
        externalIds: [{ system: 'bpmn2', id, kind: 'element' }],
        meta: {
          sourceLocalName: localName(el)
        }
      });
    }
  }

  // Warn (once per type) for common BPMN nodes we see but don't yet support.
  // We do this by scanning a few high-frequency element names.
  const maybeUnsupported = ['sendTask', 'receiveTask', 'businessRuleTask', 'complexGateway', 'transaction', 'eventSubProcess'];
  for (const ln of maybeUnsupported) {
    const found = qa(defs, ln);
    if (!found.length) continue;
    const typeId = bpmnTypeForNodeLocalName(ln.toLowerCase());
    if (!typeId) {
      if (!unsupportedNodeTypes.has(ln)) {
        unsupportedNodeTypes.add(ln);
        warnings.push(`BPMN node type <${ln}> is present but not supported yet (will be skipped).`);
      }
    }
  }

  // ------------------------------
  // Relationships (flows)
  // ------------------------------
  const supportedRelLocalNames = ['sequenceFlow', 'messageFlow', 'association'];
  const missingEndpointsWarnings = new Set<string>();

  for (const ln of supportedRelLocalNames) {
    for (const relEl of qa(defs, ln)) {
      const id = (attr(relEl, 'id') ?? '').trim();
      if (!id) {
        warnings.push(`Skipping BPMN relationship without @id (<${localName(relEl)}>)`);
        continue;
      }

      const typeId = bpmnTypeForRelLocalName(localName(relEl));
      if (!typeId) continue;

      const sourceRef = (attr(relEl, 'sourceRef') ?? '').trim();
      const targetRef = (attr(relEl, 'targetRef') ?? '').trim();
      if (!sourceRef || !targetRef) {
        warnings.push(`Skipping ${typeId} (${id}) because sourceRef/targetRef is missing.`);
        continue;
      }

      if (!idIndex.has(sourceRef) || !idIndex.has(targetRef)) {
        const key = `${typeId}:${sourceRef}->${targetRef}`;
        if (!missingEndpointsWarnings.has(key)) {
          missingEndpointsWarnings.add(key);
          warnings.push(
            `Skipping ${typeId} (${id}) because endpoint(s) were not imported (source=${sourceRef}, target=${targetRef}).`
          );
        }
        continue;
      }

      const name = (attr(relEl, 'name') ?? '').trim() || undefined;
      const docEl = childByLocalName(relEl, 'documentation');
      const documentation = text(docEl) || undefined;

      relationships.push({
        id,
        type: typeId,
        name,
        documentation,
        sourceId: sourceRef,
        targetId: targetRef,
        externalIds: [{ system: 'bpmn2', id, kind: 'relationship' }],
        meta: {
          sourceLocalName: localName(relEl)
        }
      });
    }
  }

  const ir: ImportIR = {
    folders: [],
    elements,
    relationships,
    views: [],
    meta: {
      format: 'bpmn2'
    }
  };

  return { importIR: ir, warnings };
}
