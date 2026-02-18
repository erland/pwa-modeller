import type { Model } from '../../../../types';
import { makeIssue } from '../../../issues';
import type { ValidationIssue } from '../../../types';
import { isRecord } from './shared';

export function checkUnresolvedRefs(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Surface importer/apply diagnostics (unresolved external ids that couldn't be rewritten).
  for (const el of Object.values(model.elements)) {
    if (!el.type.startsWith('bpmn.')) continue;
    if (!isRecord(el.attrs)) continue;
    const ur = isRecord(el.attrs) && isRecord(el.attrs['unresolvedRefs'])
      ? (el.attrs['unresolvedRefs'] as Record<string, unknown>)
      : undefined;
    if (!isRecord(ur) || !Object.keys(ur).length) continue;
    issues.push(
      makeIssue(
        'warning',
        `BPMN element ${el.id} has unresolved references from import: ${Object.keys(ur).join(', ')}.`,
        { kind: 'element', elementId: el.id },
        `bpmn-unresolved-refs:${el.id}`
      )
    );
  }

  for (const rel of Object.values(model.relationships)) {
    if (!rel.type.startsWith('bpmn.')) continue;
    if (!isRecord(rel.attrs)) continue;
    const ur = isRecord(rel.attrs) && isRecord(rel.attrs['unresolvedRefs'])
      ? (rel.attrs['unresolvedRefs'] as Record<string, unknown>)
      : undefined;
    if (!isRecord(ur) || !Object.keys(ur).length) continue;
    issues.push(
      makeIssue(
        'warning',
        `BPMN relationship ${rel.id} has unresolved references from import: ${Object.keys(ur).join(', ')}.`,
        { kind: 'relationship', relationshipId: rel.id },
        `bpmn-unresolved-refs-rel:${rel.id}`
      )
    );
  }

  return issues;
}
