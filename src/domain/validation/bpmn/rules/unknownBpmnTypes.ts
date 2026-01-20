import type { Model } from '../../../types';
import { BPMN_ELEMENT_TYPES, BPMN_RELATIONSHIP_TYPES } from '../../../config/catalog';
import { kindFromTypeId } from '../../../kindFromTypeId';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Detect unknown BPMN element/relationship types.
 */
export function ruleUnknownBpmnTypes(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const allowedElements = new Set(BPMN_ELEMENT_TYPES);
  const allowedRelationships = new Set(BPMN_RELATIONSHIP_TYPES);

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

  return issues;
}
