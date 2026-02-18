import type { Model } from '../../../../types';
import { makeIssue } from '../../../issues';
import type { ValidationIssue } from '../../../types';
import { getBooleanAttr, getStringAttr, isBpmnActivityType, isRecord } from './shared';

export function checkBoundaryEvents(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Boundary events -> attachedToRef should point to an activity
  for (const el of Object.values(model.elements)) {
    if (el.type !== 'bpmn.boundaryEvent') continue;
    const attachedToRef = getStringAttr(el.attrs, 'attachedToRef');
    if (!attachedToRef) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} is missing attachedToRef (it should be attached to an activity).`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-missing-attachedToRef:${el.id}`
        )
      );
      continue;
    }
    const target = model.elements[attachedToRef];
    if (!target) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} has attachedToRef=${attachedToRef} but that element does not exist.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-attachedToRef-missing:${el.id}:${attachedToRef}`
        )
      );
      continue;
    }
    if (!isBpmnActivityType(target.type)) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} should attach to an activity; ${attachedToRef} is ${target.type}.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-attachedToRef-wrongType:${el.id}:${attachedToRef}`
        )
      );
    }

    // Optional but useful sanity check: cancelActivity should be boolean when present.
    const cancelActivity = getBooleanAttr(el.attrs, 'cancelActivity');
    if (cancelActivity === undefined && isRecord(el.attrs) && el.attrs['cancelActivity'] !== undefined) {
      issues.push(
        makeIssue(
          'warning',
          `Boundary Event ${el.id} cancelActivity should be a boolean.`,
          { kind: 'element', elementId: el.id },
          `bpmn-boundary-cancelActivity-type:${el.id}`
        )
      );
    }
  }

  return issues;
}
