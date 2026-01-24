import type { Model, RelationshipType } from '../../../domain';
import { poolIdForElementInBpmnView } from './geometry';

export type BpmnRelHints = {
  preferredOrder: RelationshipType[];
  preferredDefault: RelationshipType;
};

/**
 * BPMN UX hints for relationship creation:
 * - Boundary events generally connect via Sequence Flow
 * - Cross-pool connections prefer Message Flow
 */
export function getBpmnRelationshipHints(args: {
  model: Model;
  viewId: string;
  sourceElementId: string;
  targetElementId: string;
}): BpmnRelHints {
  const { model, viewId, sourceElementId, targetElementId } = args;

  const sourceType = model.elements[sourceElementId]?.type;
  const isBoundarySource = String(sourceType) === 'bpmn.boundaryEvent';

  const sp = poolIdForElementInBpmnView(model, viewId, sourceElementId);
  const tp = poolIdForElementInBpmnView(model, viewId, targetElementId);
  const crossPool = Boolean(sp && tp && sp !== tp);

  const preferredOrder: RelationshipType[] = isBoundarySource
    ? ['bpmn.sequenceFlow', 'bpmn.messageFlow', 'bpmn.association']
    : crossPool
      ? ['bpmn.messageFlow', 'bpmn.sequenceFlow', 'bpmn.association']
      : ['bpmn.sequenceFlow', 'bpmn.messageFlow', 'bpmn.association'];

  const preferredDefault: RelationshipType = isBoundarySource ? 'bpmn.sequenceFlow' : crossPool ? 'bpmn.messageFlow' : 'bpmn.sequenceFlow';

  return { preferredOrder, preferredDefault };
}
