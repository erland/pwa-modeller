import type { Model } from '../../../types';
import { kindFromTypeId } from '../../../kindFromTypeId';
import { makeIssue } from '../../issues';
import type { ValidationIssue } from '../../types';
import {
  getBooleanAttr,
  getNonEmptyString,
  getStringAttr,
  isExclusiveOrInclusiveGateway,
  isBpmnGatewayType,
  isRecord,
} from '../shared';

/**
 * Gateway default flow correctness + condition expression suggestions.
 */
export function ruleGatewayFlows(model: Model): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const gateway of Object.values(model.elements)) {
    const kind = gateway.kind ?? kindFromTypeId(gateway.type);
    if (kind !== 'bpmn') continue;
    if (!isBpmnGatewayType(gateway.type)) continue;

    const defaultFlowRef = getStringAttr(gateway.attrs, 'defaultFlowRef');
    if (defaultFlowRef) {
      const rel = model.relationships[defaultFlowRef];
      if (!rel) {
        issues.push(
          makeIssue(
            'warning',
            `Gateway ${gateway.id} has a default flow that does not exist: ${defaultFlowRef}.`,
            { kind: 'element', elementId: gateway.id },
            `bpmn-gw-default-missing:${gateway.id}`
          )
        );
      } else if (rel.type !== 'bpmn.sequenceFlow' || rel.sourceElementId !== gateway.id) {
        issues.push(
          makeIssue(
            'warning',
            `Gateway ${gateway.id} default flow should reference an outgoing Sequence Flow.`,
            { kind: 'element', elementId: gateway.id },
            `bpmn-gw-default-not-outgoing:${gateway.id}`
          )
        );
      }
    }

    // Condition expression suggestions for Exclusive/Inclusive gateways.
    if (isExclusiveOrInclusiveGateway(gateway.type)) {
      const outgoing = Object.values(model.relationships).filter(
        (r) => r && r.type === 'bpmn.sequenceFlow' && r.sourceElementId === gateway.id
      );

      if (!outgoing.length) continue;

      // Determine default flow by gateway attr or legacy per-relationship flag.
      let resolvedDefault = defaultFlowRef;
      if (!resolvedDefault) {
        const flagged = outgoing.find((r) => getBooleanAttr(r.attrs, 'isDefault') === true);
        if (flagged) resolvedDefault = flagged.id;
      }

      for (const r of outgoing) {
        if (resolvedDefault && r.id === resolvedDefault) continue;
        const conditionExpression = isRecord(r.attrs) ? getNonEmptyString(r.attrs['conditionExpression']) : undefined;
        if (!conditionExpression) {
          issues.push(
            makeIssue(
              'warning',
              `Outgoing Sequence Flow ${r.id} from ${gateway.type} ${gateway.id} should usually have a condition expression (or be the default flow).`,
              { kind: 'relationship', relationshipId: r.id },
              `bpmn-gw-missing-condition:${gateway.id}:${r.id}`
            )
          );
        }
      }
    }
  }

  return issues;
}
