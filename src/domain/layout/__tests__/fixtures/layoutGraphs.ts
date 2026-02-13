import type { LayoutInput } from '../../types';

/**
 * Small, deterministic graphs used for fast smoke/regression tests of auto-layout.
 * Keep these tiny so ELK runs stay very fast in Jest.
 */

export function makeArchiMateBandedInput(): LayoutInput {
  return {
    nodes: [
      { id: 'B1', width: 120, height: 60, layerHint: 'Business' },
      { id: 'B2', width: 120, height: 60, layerHint: 'Business' },
      { id: 'A1', width: 140, height: 70, layerHint: 'Application' },
      { id: 'T1', width: 140, height: 70, layerHint: 'Technology' },
      { id: 'O1', width: 120, height: 60, layerHint: 'Other' },
    ],
    edges: [
      { id: 'e1', sourceId: 'B1', targetId: 'A1', weight: 2 },
      { id: 'e2', sourceId: 'B2', targetId: 'A1', weight: 1 },
      { id: 'e3', sourceId: 'A1', targetId: 'T1', weight: 2 },
      { id: 'e4', sourceId: 'T1', targetId: 'O1', weight: 1 },
    ],
  };
}

export function makeBpmnSimpleInput(): LayoutInput {
  return {
    nodes: [
      { id: 'Start', width: 48, height: 48, kind: 'bpmn.startEvent' },
      { id: 'Task1', width: 160, height: 80, kind: 'bpmn.task' },
      { id: 'Gateway', width: 60, height: 60, kind: 'bpmn.exclusiveGateway' },
      { id: 'Task2', width: 160, height: 80, kind: 'bpmn.task' },
      { id: 'End', width: 48, height: 48, kind: 'bpmn.endEvent' },
    ],
    edges: [
      { id: 'sf1', sourceId: 'Start', targetId: 'Task1', kind: 'bpmn.sequenceFlow' },
      { id: 'sf2', sourceId: 'Task1', targetId: 'Gateway', kind: 'bpmn.sequenceFlow' },
      { id: 'sf3', sourceId: 'Gateway', targetId: 'Task2', kind: 'bpmn.sequenceFlow' },
      { id: 'sf4', sourceId: 'Task2', targetId: 'End', kind: 'bpmn.sequenceFlow' },
    ],
  };
}

export function makeUmlSimpleInput(): LayoutInput {
  return {
    nodes: [
      { id: 'ClassA', width: 170, height: 90, kind: 'uml.class' },
      { id: 'ClassB', width: 170, height: 90, kind: 'uml.class' },
      { id: 'ClassC', width: 170, height: 90, kind: 'uml.class' },
      { id: 'IfaceI', width: 170, height: 90, kind: 'uml.interface' },
    ],
    edges: [
      { id: 'g1', sourceId: 'ClassB', targetId: 'ClassA', kind: 'uml.generalization' },
      { id: 'g2', sourceId: 'ClassC', targetId: 'ClassA', kind: 'uml.generalization' },
      { id: 'r1', sourceId: 'ClassA', targetId: 'IfaceI', kind: 'uml.realization' },
    ],
  };
}

export function makeHierarchicalContainerInput(): LayoutInput {
  return {
    nodes: [
      { id: 'Pool', width: 600, height: 320, kind: 'bpmn.pool' },
      { id: 'Lane', width: 560, height: 240, parentId: 'Pool', kind: 'bpmn.lane' },
      { id: 'Task', width: 160, height: 80, parentId: 'Lane', kind: 'bpmn.task' },
      { id: 'End', width: 48, height: 48, parentId: 'Lane', kind: 'bpmn.endEvent' },
    ],
    edges: [
      { id: 'sf', sourceId: 'Task', targetId: 'End', kind: 'bpmn.sequenceFlow' },
    ],
  };
}
