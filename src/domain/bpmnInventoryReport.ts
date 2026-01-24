import { getElementTypesForKind, getRelationshipTypesForKind } from './config/catalog';
import type { ElementType, RelationshipType } from './types';

/**
 * Step 1 — Inventory what exists vs what's missing.
 *
 * Goal: keep three moving parts in sync:
 *  - BPMN2 XML import logic (what we parse/write into attrs)
 *  - Domain model/guards (what attrs shapes we explicitly support)
 *  - Properties panel (what users can actually see/edit)
 */

export type InventorySupport = {
  importerAttrs: string[];
  domainGuard?: string;
  properties?: string;
  notes?: string;
};

// --------------------------------------------------------------------------------------
// Importer → attrs coverage (BPMN2 XML)
// Keep this explicit and exhaustive so new types don't silently drift.
// --------------------------------------------------------------------------------------

export const BPMN_IMPORTER_ATTRS: Record<string, string[]> = {
  // Containers
  'bpmn.pool': ['processRef (rewritten to internal id)'],
  'bpmn.lane': ['flowNodeRefs[] (rewritten to internal ids)'],
  'bpmn.process': ['isExecutable'],

  // Global defs
  'bpmn.message': ['itemRef?'],
  'bpmn.signal': [],
  'bpmn.error': ['errorCode?', 'structureRef?'],
  'bpmn.escalation': ['escalationCode?'],
  'bpmn.dataObject': [],
  'bpmn.dataStore': [],

  // Activities
  'bpmn.task': ['loopType', 'isForCompensation?'],
  'bpmn.userTask': ['loopType', 'isForCompensation?'],
  'bpmn.serviceTask': ['loopType', 'isForCompensation?'],
  'bpmn.scriptTask': ['loopType', 'isForCompensation?'],
  'bpmn.manualTask': ['loopType', 'isForCompensation?'],
  'bpmn.callActivity': ['loopType', 'isForCompensation?', 'isCall?'],
  'bpmn.subProcess': ['loopType', 'isForCompensation?'],

  // Events
  'bpmn.startEvent': ['eventKind', 'eventDefinition.*', 'timer fields (timeDate/timeDuration/timeCycle)'],
  'bpmn.endEvent': ['eventKind', 'eventDefinition.*'],
  'bpmn.intermediateCatchEvent': ['eventKind', 'eventDefinition.*'],
  'bpmn.intermediateThrowEvent': ['eventKind', 'eventDefinition.*'],
  'bpmn.boundaryEvent': ['eventKind', 'eventDefinition.*', 'attachedToRef (rewritten to internal id)', 'cancelActivity'],

  // Gateways
  'bpmn.gatewayExclusive': ['gatewayKind? (mostly derived by type)', 'defaultFlowRef? (via UI/store)'],
  'bpmn.gatewayParallel': ['gatewayKind? (mostly derived by type)', 'defaultFlowRef? (via UI/store)'],
  'bpmn.gatewayInclusive': ['gatewayKind? (mostly derived by type)', 'defaultFlowRef? (via UI/store)'],
  'bpmn.gatewayEventBased': ['gatewayKind? (mostly derived by type)', 'defaultFlowRef? (via UI/store)'],

  // Artifacts / data references
  'bpmn.textAnnotation': ['text'],
  'bpmn.dataObjectReference': ['dataObjectRef (rewritten to internal id)'],
  'bpmn.dataStoreReference': ['dataStoreRef (rewritten to internal id)'],
  'bpmn.group': [],
};

export const BPMN_RELATIONSHIP_IMPORTER_ATTRS: Record<string, string[]> = {
  'bpmn.sequenceFlow': ['conditionExpression?'],
  'bpmn.messageFlow': ['messageRef? (rewritten to internal id)'],
  'bpmn.association': [],
  'bpmn.dataInputAssociation': [],
  'bpmn.dataOutputAssociation': [],
};

// --------------------------------------------------------------------------------------
// Domain guard coverage (attrs validators)
// --------------------------------------------------------------------------------------

export function getBpmnDomainGuardForType(t: string): string | undefined {
  // Keep in sync with src/domain/bpmnAttrs.ts
  if (t === 'bpmn.pool') return 'isBpmnPoolAttrs';
  if (t === 'bpmn.process') return 'isBpmnProcessAttrs';
  if (t === 'bpmn.textAnnotation') return 'isBpmnTextAnnotationAttrs';
  if (t === 'bpmn.dataObjectReference') return 'isBpmnDataObjectReferenceAttrs';
  if (t === 'bpmn.dataStoreReference') return 'isBpmnDataStoreReferenceAttrs';
  if (t === 'bpmn.message') return 'isBpmnMessageAttrs';
  if (t === 'bpmn.error') return 'isBpmnErrorAttrs';
  if (t === 'bpmn.escalation') return 'isBpmnEscalationAttrs';
  if (
    t === 'bpmn.task' ||
    t === 'bpmn.userTask' ||
    t === 'bpmn.serviceTask' ||
    t === 'bpmn.scriptTask' ||
    t === 'bpmn.manualTask' ||
    t === 'bpmn.callActivity' ||
    t === 'bpmn.subProcess'
  )
    return 'isBpmnActivityAttrs';

  if (
    t === 'bpmn.startEvent' ||
    t === 'bpmn.endEvent' ||
    t === 'bpmn.intermediateCatchEvent' ||
    t === 'bpmn.intermediateThrowEvent' ||
    t === 'bpmn.boundaryEvent'
  )
    return 'isBpmnEventAttrs';

  if (
    t === 'bpmn.gatewayExclusive' ||
    t === 'bpmn.gatewayParallel' ||
    t === 'bpmn.gatewayInclusive' ||
    t === 'bpmn.gatewayEventBased'
  )
    return 'isBpmnGatewayAttrs';

  if (t === 'bpmn.lane') return 'isBpmnLaneAttrs';

  if (t === 'bpmn.sequenceFlow') return 'isBpmnSequenceFlowAttrs';
  if (t === 'bpmn.messageFlow') return 'isBpmnMessageFlowAttrs';

  return undefined;
}

// --------------------------------------------------------------------------------------
// Properties panel coverage
// --------------------------------------------------------------------------------------

export function getBpmnPropertiesPanelForType(t: string): string | undefined {
  // See src/notations/bpmn/index.ts (getElementPropertySections)
  if (t === 'bpmn.pool') return 'BpmnPoolPropertiesSection';
  if (t === 'bpmn.lane') return 'BpmnLanePropertiesSection';
  if (t === 'bpmn.textAnnotation') return 'BpmnTextAnnotationPropertiesSection';
  if (t === 'bpmn.dataObjectReference') return 'BpmnDataObjectReferencePropertiesSection';
  if (t === 'bpmn.dataStoreReference') return 'BpmnDataStoreReferencePropertiesSection';
  if (t === 'bpmn.process') return 'BpmnProcessPropertiesSection';

  if (
    t === 'bpmn.task' ||
    t === 'bpmn.userTask' ||
    t === 'bpmn.serviceTask' ||
    t === 'bpmn.scriptTask' ||
    t === 'bpmn.manualTask' ||
    t === 'bpmn.callActivity' ||
    t === 'bpmn.subProcess'
  )
    return 'BpmnTaskPropertiesSection';

  if (
    t === 'bpmn.startEvent' ||
    t === 'bpmn.endEvent' ||
    t === 'bpmn.intermediateCatchEvent' ||
    t === 'bpmn.intermediateThrowEvent' ||
    t === 'bpmn.boundaryEvent'
  )
    return 'BpmnEventPropertiesSection';

  if (
    t === 'bpmn.gatewayExclusive' ||
    t === 'bpmn.gatewayParallel' ||
    t === 'bpmn.gatewayInclusive' ||
    t === 'bpmn.gatewayEventBased'
  )
    return 'BpmnGatewayPropertiesSection';

  return undefined;
}

export function getBpmnPropertiesPanelForRelationshipType(t: string): string {
  void t;
  // See src/notations/bpmn/index.ts (renderRelationshipProperties)
  return 'BpmnRelationshipProperties';
}

function fmtBullets(items: string[]): string {
  if (!items.length) return '—';
  // Use <br/> so markdown tables render on GitHub and in many UIs.
  return items.map((s) => `• ${s}`).join('<br/>');
}

function mdCell(s: string): string {
  // Keep table stable; avoid newlines.
  return String(s).replace(/\n/g, ' ');
}

export function generateBpmnInventoryMarkdown(): string {
  const elementTypes = getElementTypesForKind('bpmn') as unknown as ElementType[];
  const relTypes = getRelationshipTypesForKind('bpmn') as unknown as RelationshipType[];

  const lines: string[] = [];

  lines.push('# BPMN import ↔ domain ↔ properties inventory');
  lines.push('');
  lines.push(
    'This file is generated (and checked) by a Jest test. Update the generator if you change BPMN importer, domain guards, or BPMN properties UI.'
  );
  lines.push('');
  lines.push('## Element types');
  lines.push('');
  lines.push('| BPMN element type | Importer writes attrs | Domain guard | Properties panel | Notes |');
  lines.push('|---|---|---|---|---|');

  for (const t of elementTypes) {
    const importerAttrs = BPMN_IMPORTER_ATTRS[String(t)] ?? [];
    const guard = getBpmnDomainGuardForType(String(t));
    const props = getBpmnPropertiesPanelForType(String(t));

    const notes: string[] = [];
    if (String(t) === 'bpmn.pool') notes.push('processRef stored on pool');
    if (String(t) === 'bpmn.lane') notes.push('flowNodeRefs stored on lane');
    if (String(t) === 'bpmn.textAnnotation') notes.push('text stored in attrs.text');
    if (String(t) === 'bpmn.dataObjectReference') notes.push('ref rewritten to internal id');
    if (String(t) === 'bpmn.dataStoreReference') notes.push('ref rewritten to internal id');
    if (String(t) === 'bpmn.message' || String(t) === 'bpmn.signal' || String(t) === 'bpmn.error' || String(t) === 'bpmn.escalation')
      notes.push('global def; excluded from auto-layout');
    if (String(t) === 'bpmn.process') notes.push('lightweight container; excluded from auto-layout');

    lines.push(
      `| ${mdCell('`' + String(t) + '`')} | ${mdCell(fmtBullets(importerAttrs))} | ${mdCell(guard ?? '—')} | ${mdCell(props ?? '—')} | ${mdCell(notes.join('; ') || '—')} |`
    );
  }

  lines.push('');
  lines.push('## Relationship types');
  lines.push('');
  lines.push('| BPMN relationship type | Importer writes attrs | Domain guard | Properties panel | Notes |');
  lines.push('|---|---|---|---|---|');

  for (const t of relTypes) {
    const importerAttrs = BPMN_RELATIONSHIP_IMPORTER_ATTRS[String(t)] ?? [];
    const guard = getBpmnDomainGuardForType(String(t));
    const props = getBpmnPropertiesPanelForRelationshipType(String(t));

    const notes: string[] = [];
    if (String(t) === 'bpmn.messageFlow') notes.push('messageRef rewritten to internal id');

    lines.push(
      `| ${mdCell('`' + String(t) + '`')} | ${mdCell(fmtBullets(importerAttrs))} | ${mdCell(guard ?? '—')} | ${mdCell(props)} | ${mdCell(notes.join('; ') || '—')} |`
    );
  }

  lines.push('');
  lines.push('## Summary');
  lines.push('');

  const elementGuards = new Set(elementTypes.map((t) => getBpmnDomainGuardForType(String(t))).filter(Boolean) as string[]);
  const elementPanel = new Set(elementTypes.map((t) => getBpmnPropertiesPanelForType(String(t))).filter(Boolean) as string[]);
  const relGuards = new Set(relTypes.map((t) => getBpmnDomainGuardForType(String(t))).filter(Boolean) as string[]);

  lines.push(`- BPMN element types in catalog: **${elementTypes.length}**`);
  lines.push(`- Element types with explicit domain guards: **${countTypesWithGuards(elementTypes)}**`);
  lines.push(`- Element types surfaced in properties panel: **${countTypesWithProps(elementTypes)}**`);
  lines.push(`- BPMN relationship types in catalog: **${relTypes.length}**`);
  lines.push(`- Relationship types with explicit domain guards: **${countTypesWithGuards(relTypes)}**`);
  lines.push(`- Relationship types surfaced in properties panel: **${relTypes.length}**`);

  // prevent unused (kept for potential future per-guard counts)
  void elementGuards;
  void elementPanel;
  void relGuards;

  return lines.join('\n') + '\n';
}

function countTypesWithGuards(types: (ElementType | RelationshipType)[]): number {
  let n = 0;
  for (const t of types) if (getBpmnDomainGuardForType(String(t))) n++;
  return n;
}

function countTypesWithProps(types: (ElementType | RelationshipType)[]): number {
  let n = 0;
  for (const t of types) if (getBpmnPropertiesPanelForType(String(t))) n++;
  return n;
}
