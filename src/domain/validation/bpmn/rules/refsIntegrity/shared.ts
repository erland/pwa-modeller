import type { Model } from '../../../../types';
import { makeIssue } from '../../../issues';
import type { ValidationIssue } from '../../../types';
import { getBooleanAttr, getStringAttr, isBpmnActivityType, isBpmnFlowNodeType, isRecord } from '../../shared';

export function getEventDefinition(attrs: unknown): Record<string, unknown> | undefined {
  if (!isRecord(attrs)) return undefined;
  const ed = attrs['eventDefinition'];
  return isRecord(ed) ? ed : undefined;
}

export function pushMissingOrWrongRef(
  issues: ValidationIssue[],
  args: {
    ownerId: string;
    ownerType: string;
    field: string;
    refId?: string;
    expectedType: string;
    messageMissing: string;
    messageWrongType?: (actualType: string) => string;
    suffix: string;
    targetKind: 'element' | 'relationship';
  },
  model: Model
): void {
  const ref = args.refId;
  if (!ref) {
    if (args.messageMissing) {
      issues.push(
        makeIssue(
          'warning',
          args.messageMissing,
          args.targetKind === 'element'
            ? { kind: 'element', elementId: args.ownerId }
            : { kind: 'relationship', relationshipId: args.ownerId },
          args.suffix
        )
      );
    }
    return;
  }

  const el = model.elements[ref];
  if (!el) {
    issues.push(
      makeIssue(
        'warning',
        `${args.ownerType} ${args.ownerId} has ${args.field}=${ref} but that element does not exist.`,
        args.targetKind === 'element'
          ? { kind: 'element', elementId: args.ownerId }
          : { kind: 'relationship', relationshipId: args.ownerId },
        `${args.suffix}:missing:${ref}`
      )
    );
    return;
  }

  if (el.type !== args.expectedType) {
    issues.push(
      makeIssue(
        'warning',
        args.messageWrongType
          ? args.messageWrongType(el.type)
          : `${args.ownerType} ${args.ownerId} has ${args.field}=${ref} but that element is type ${el.type} (expected ${args.expectedType}).`,
        args.targetKind === 'element'
          ? { kind: 'element', elementId: args.ownerId }
          : { kind: 'relationship', relationshipId: args.ownerId },
        `${args.suffix}:wrongType:${ref}`
      )
    );
  }
}

// re-export commonly used shared helpers so leaf rules can import from one place
export { getBooleanAttr, getStringAttr, isBpmnActivityType, isBpmnFlowNodeType, isRecord };
