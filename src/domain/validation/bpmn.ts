import type { Model } from '../types';
import { BPMN_ELEMENT_TYPES, BPMN_RELATIONSHIP_TYPES } from '../config/catalog';
import { kindFromTypeId } from '../kindFromTypeId';
import { makeIssue } from './issues';
import type { ValidationIssue } from './types';

/**
 * Minimal BPMN validation (v1).
 *
 * Kept intentionally small:
 * - Detect unknown BPMN element/relationship types
 * - Ensure Sequence Flow connects BPMN elements
 */
export function validateBpmnBasics(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allowedElements = new Set(BPMN_ELEMENT_TYPES);
  const allowedRelationships = new Set(BPMN_RELATIONSHIP_TYPES);

  // ------------------------------
  // Unknown BPMN element/relationship types
  // ------------------------------
  for (const el of Object.values(model.elements)) {
    const kind = el.kind ?? kindFromTypeId(el.type);
    if (kind !== 'bpmn') continue;
    if (el.type !== 'Unknown' && !allowedElements.has(el.type)) {
      issues.push(
        makeIssue(
          'warning',
          `BPMN element ${el.id} has unknown type: ${el.type}`,
          { kind: 'element', elementId: el.id },
          `bpmn-el-unknown-type:${el.id}`
        )
      );
    }
  }

  for (const rel of Object.values(model.relationships)) {
    const kind = rel.kind ?? kindFromTypeId(rel.type);
    if (kind !== 'bpmn') continue;
    if (rel.type !== 'Unknown' && !allowedRelationships.has(rel.type)) {
      issues.push(
        makeIssue(
          'warning',
          `BPMN relationship ${rel.id} has unknown type: ${rel.type}`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-rel-unknown-type:${rel.id}`
        )
      );
    }
  }

  // ------------------------------
  // Sequence Flow endpoints must be BPMN elements
  // ------------------------------
  for (const rel of Object.values(model.relationships)) {
    if (rel.type !== 'bpmn.sequenceFlow') continue;
    const src = rel.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
    const tgt = rel.targetElementId ? model.elements[rel.targetElementId] : undefined;

    if (!src || !tgt) {
      issues.push(
        makeIssue(
          'warning',
          `BPMN Sequence Flow ${rel.id} must have both source and target set.`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-seqflow-missing-endpoints:${rel.id}`
        )
      );
      continue;
    }

    const srcKind = src.kind ?? kindFromTypeId(src.type);
    const tgtKind = tgt.kind ?? kindFromTypeId(tgt.type);

    if (srcKind !== 'bpmn' || tgtKind !== 'bpmn') {
      issues.push(
        makeIssue(
          'error',
          `BPMN Sequence Flow ${rel.id} must connect two BPMN elements.`,
          { kind: 'relationship', relationshipId: rel.id },
          `bpmn-seqflow-nonbpmn-endpoint:${rel.id}`
        )
      );
    }
  }

  return issues;
}
