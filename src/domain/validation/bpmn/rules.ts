import type { Model } from '../../types';
import type { ValidationIssue } from '../types';

import { ruleBoundaryEvents } from './rules/boundaryEvents';
import { ruleContainersInViews } from './rules/containersInViews';
import { ruleGatewayFlows } from './rules/gatewayFlows';
import { ruleRelationships } from './rules/relationships';
import { ruleUnknownBpmnTypes } from './rules/unknownBpmnTypes';

export type BpmnValidationRule = (model: Model) => ValidationIssue[];

/**
 * Ordered list of BPMN validation rules.
 *
 * Keep this list stable to avoid noisy changes in UI ordering.
 */
export const bpmnValidationRules: BpmnValidationRule[] = [
  ruleUnknownBpmnTypes,
  ruleContainersInViews,
  ruleBoundaryEvents,
  ruleRelationships,
  ruleGatewayFlows,
];
