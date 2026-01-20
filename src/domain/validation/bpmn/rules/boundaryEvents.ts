import type { Model } from '../../../types';
import { kindFromTypeId } from '../../../kindFromTypeId';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';
import { getStringAttr, isBpmnActivityType } from '../shared';

/**
 * Boundary event attachment checks.
 */
export function ruleBoundaryEvents(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const el of Object.values(model.elements)) {
    const kind = el.kind ?? kindFromTypeId(el.type);
    if (kind !== 'bpmn') continue;
    if (el.type !== 'bpmn.boundaryEvent') continue;

    const attachedToRef = getStringAttr(el.attrs, 'attachedToRef');
    if (!attachedToRef) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} should be attached to an activity.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-missing-host:${el.id}`
        )
      );
      continue;
    }

    const host = model.elements[attachedToRef];
    if (!host) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} is attached to a missing element: ${attachedToRef}.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-host-missing:${el.id}`
        )
      );
      continue;
    }

    if (!isBpmnActivityType(host.type)) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} should be attached to a BPMN activity (found: ${host.type}).`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-host-not-activity:${el.id}`
        )
      );
    }
  }

  return issues;
}
