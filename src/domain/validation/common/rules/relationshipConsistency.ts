import type { Model } from '../../../types';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';

/**
 * Relationship endpoint invariants + reference existence.
 */
export function validateCommonRelationshipConsistency(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rel of Object.values(model.relationships)) {
    const hasSrcEl = !!rel.sourceElementId;
    const hasSrcCo = !!rel.sourceConnectorId;
    const hasTgtEl = !!rel.targetElementId;
    const hasTgtCo = !!rel.targetConnectorId;

    // Endpoint invariants (xor)
    if (hasSrcEl === hasSrcCo) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} must have exactly one source endpoint (element or connector).`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-src-endpoint-xor:${rel.id}`
        )
      );
    }
    if (hasTgtEl === hasTgtCo) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} must have exactly one target endpoint (element or connector).`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-tgt-endpoint-xor:${rel.id}`
        )
      );
    }

    const sourceEl = rel.sourceElementId ? model.elements[rel.sourceElementId] : undefined;
    const targetEl = rel.targetElementId ? model.elements[rel.targetElementId] : undefined;
    const sourceCo = rel.sourceConnectorId ? (model.connectors ?? {})[rel.sourceConnectorId] : undefined;
    const targetCo = rel.targetConnectorId ? (model.connectors ?? {})[rel.targetConnectorId] : undefined;

    if (rel.sourceElementId && !sourceEl) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing source element: ${rel.sourceElementId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-src-missing:${rel.id}`
        )
      );
    }
    if (rel.targetElementId && !targetEl) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing target element: ${rel.targetElementId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-tgt-missing:${rel.id}`
        )
      );
    }

    if (rel.sourceConnectorId && !sourceCo) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing source connector: ${rel.sourceConnectorId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-src-connector-missing:${rel.id}`
        )
      );
    }
    if (rel.targetConnectorId && !targetCo) {
      issues.push(
        makeIssue(
          'error',
          `Relationship ${rel.id} references missing target connector: ${rel.targetConnectorId}`,
          { kind: 'relationship', relationshipId: rel.id },
          `rel-tgt-connector-missing:${rel.id}`
        )
      );
    }
  }

  return issues;
}
