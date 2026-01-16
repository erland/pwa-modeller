import type { Model } from '../types';
import { validateRelationship as validateRelationshipRule } from '../config/archimatePalette';
import { kindFromTypeId } from '../kindFromTypeId';
import { makeIssue } from './issues';
import type { ValidationIssue } from './types';

export function validateArchimateRelationshipRules(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rel of Object.values(model.relationships)) {
    const kind = rel.kind ?? kindFromTypeId(rel.type);
    if (kind !== 'archimate') continue;

    const hasSrcCo = !!rel.sourceConnectorId;
    const hasTgtCo = !!rel.targetConnectorId;

    // Only meaningful for element-to-element relationships.
    if (hasSrcCo || hasTgtCo) continue;

    const source = rel.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
    const target = rel.targetElementId ? model.elements[rel.targetElementId] : undefined;

    if (!source || !target) continue;

    const result = validateRelationshipRule(source.type, target.type, rel.type);
    if (!result.allowed) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} is not allowed: ${result.reason}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-rule:${rel.id}`
        )
      );
    }
  }

  return issues;
}
