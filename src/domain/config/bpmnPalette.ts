import type { ElementType, RelationshipType } from '../types';
import type { RelationshipMatrix, RelationshipMatrixEntry } from '../validation/relationshipMatrix';

/**
 * BPMN relationship "matrix".
 *
 * BPMN 2.0 does not ship with a single canonical relationship table (like ArchiMate),
 * but we still benefit from a deterministic matrix for:
 *  - UI guidance (relationship creation dialogs)
 *  - strict-ish validation / consistency checks
 *  - a human-readable "allowed connections" reference
 *
 * This matrix reflects what the app currently supports:
 *  - bpmn.sequenceFlow
 *  - bpmn.messageFlow
 *  - bpmn.association
 *
 * (Data associations and the full BPMN event/message semantics can be added later.)
 */

export type BpmnRelationshipType = 'bpmn.sequenceFlow' | 'bpmn.messageFlow' | 'bpmn.association';

const BPMN_CONTAINERS = new Set<ElementType>(['bpmn.pool', 'bpmn.lane']);
const BPMN_GLOBALS = new Set<ElementType>(['bpmn.message', 'bpmn.signal', 'bpmn.error', 'bpmn.escalation']);
const BPMN_ARTIFACTS = new Set<ElementType>([
  'bpmn.textAnnotation',
  'bpmn.dataObjectReference',
  'bpmn.dataStoreReference',
  'bpmn.group',
]);

const BPMN_FLOW_NODES = new Set<ElementType>([
  // Activities
  'bpmn.task',
  'bpmn.userTask',
  'bpmn.serviceTask',
  'bpmn.scriptTask',
  'bpmn.manualTask',
  'bpmn.callActivity',
  'bpmn.subProcess',

  // Events
  'bpmn.startEvent',
  'bpmn.endEvent',
  'bpmn.intermediateCatchEvent',
  'bpmn.intermediateThrowEvent',
  'bpmn.boundaryEvent',

  // Gateways
  'bpmn.gatewayExclusive',
  'bpmn.gatewayParallel',
  'bpmn.gatewayInclusive',
  'bpmn.gatewayEventBased',
]);

function isBpmnType(t: ElementType): boolean {
  return typeof t === 'string' && t.startsWith('bpmn.');
}

export function isBpmnConnectableNodeType(t: ElementType): boolean {
  if (!isBpmnType(t)) return false;
  if (BPMN_CONTAINERS.has(t)) return false;
  if (BPMN_GLOBALS.has(t)) return false;
  if (BPMN_ARTIFACTS.has(t)) return false;
  return BPMN_FLOW_NODES.has(t);
}

export function isBpmnArtifactType(t: ElementType): boolean {
  return BPMN_ARTIFACTS.has(t);
}

export function isBpmnContainerType(t: ElementType): boolean {
  return BPMN_CONTAINERS.has(t);
}

export function isBpmnGlobalType(t: ElementType): boolean {
  return BPMN_GLOBALS.has(t);
}

export function getAllowedBpmnRelationshipTypes(sourceType: ElementType, targetType: ElementType): RelationshipType[] {
  // Keep Unknown permissive (e.g. imported legacy types).
  if (sourceType === 'Unknown' || targetType === 'Unknown') return ['bpmn.sequenceFlow', 'bpmn.messageFlow', 'bpmn.association'];

  // Only reason about BPMN types.
  if (!isBpmnType(sourceType) || !isBpmnType(targetType)) return [];

  // No relationships from/to containers or globals.
  if (isBpmnContainerType(sourceType) || isBpmnContainerType(targetType)) return [];
  if (isBpmnGlobalType(sourceType) || isBpmnGlobalType(targetType)) return [];

  const allowed = new Set<RelationshipType>();

  // Sequence Flow + Message Flow: between flow nodes.
  if (isBpmnConnectableNodeType(sourceType) && isBpmnConnectableNodeType(targetType)) {
    allowed.add('bpmn.sequenceFlow');
    allowed.add('bpmn.messageFlow');
  }

  // Association: artifact <-> flow node (or artifact <-> anything non-container/global).
  // Keep it pragmatic: allow associations where at least one end is an artifact.
  const sArt = isBpmnArtifactType(sourceType);
  const tArt = isBpmnArtifactType(targetType);
  if (sArt || tArt) {
    // Prevent artifact-to-artifact to avoid meaningless wiring.
    if (!(sArt && tArt)) {
      // And prevent artifact-to-container/global which we already excluded.
      allowed.add('bpmn.association');
    }
  }

  return Array.from(allowed);
}

export function validateBpmnRelationshipByMatrix(args: {
  relationshipType: RelationshipType;
  sourceType: ElementType;
  targetType: ElementType;
}): { allowed: true } | { allowed: false; reason: string; allowedTypes: RelationshipType[] } {
  const { relationshipType, sourceType, targetType } = args;
  const allowedTypes = getAllowedBpmnRelationshipTypes(sourceType, targetType);
  if (allowedTypes.includes(relationshipType)) return { allowed: true };
  return {
    allowed: false,
    reason: `Relationship ${relationshipType} is not allowed from ${sourceType} to ${targetType} according to the BPMN matrix.`,
    allowedTypes,
  };
}

function entry(core: RelationshipType[]): RelationshipMatrixEntry {
  return { core: new Set(core), derived: new Set() };
}

/**
 * Build a full matrix for the BPMN types we currently expose in the catalog.
 *
 * We build it on demand to keep it in sync with the rule function.
 */
export function buildBpmnRelationshipMatrix(allElementTypes: ElementType[]): RelationshipMatrix {
  const matrix: RelationshipMatrix = new Map();

  for (const s of allElementTypes) {
    if (typeof s !== 'string' || !s.startsWith('bpmn.')) continue;
    let tMap = matrix.get(s);
    if (!tMap) {
      tMap = new Map();
      matrix.set(s, tMap);
    }
    for (const t of allElementTypes) {
      if (typeof t !== 'string' || !t.startsWith('bpmn.')) continue;
      const allowed = getAllowedBpmnRelationshipTypes(s, t);
      if (allowed.length) tMap.set(t, entry(allowed));
    }
  }

  return matrix;
}
