import type { Model } from '../../../../types';
import type { ValidationIssue } from '../../../types';

import { checkBoundaryEvents } from './boundaryEvents';
import { checkDataReferences } from './dataRefs';
import { checkEventDefinitionRefs } from './eventDefinitions';
import { checkLaneFlowNodeRefs } from './lanesAndFlowNodes';
import { checkMessageFlowRefs } from './messageFlows';
import { checkPoolProcessRefs } from './poolsAndProcesses';
import { checkUnresolvedRefs } from './unresolvedRefs';

/**
 * Reference integrity checks for BPMN elements/relationships.
 */
export function ruleRefsIntegrity(model: Model): ValidationIssue[] {
  return [
    ...checkUnresolvedRefs(model),
    ...checkPoolProcessRefs(model),
    ...checkLaneFlowNodeRefs(model),
    ...checkBoundaryEvents(model),
    ...checkDataReferences(model),
    ...checkEventDefinitionRefs(model),
    ...checkMessageFlowRefs(model),
  ];
}

// Re-export rule parts (useful for unit tests)
export {
  checkUnresolvedRefs,
  checkPoolProcessRefs,
  checkLaneFlowNodeRefs,
  checkBoundaryEvents,
  checkDataReferences,
  checkEventDefinitionRefs,
  checkMessageFlowRefs,
};
