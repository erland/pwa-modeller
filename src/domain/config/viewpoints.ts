import type { Viewpoint } from '../types';

/**
 * Minimal built-in viewpoints (metadata only).
 *
 * This is *not* a full ArchiMate viewpoint catalog. It's a starting point that can be
 * expanded as the UI grows.
 */

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: 'layered',
    name: 'Layered View',
    description: 'General layered view across business/application/technology.',
    allowedElementTypes: [
      'BusinessActor',
      'BusinessProcess',
      'BusinessService',
      'ApplicationComponent',
      'ApplicationService',
      'DataObject',
      'Node',
      'TechnologyService'
    ],
    allowedRelationshipTypes: ['Association', 'Serving', 'Flow', 'Realization', 'Composition', 'Aggregation']
  },
  {
    id: 'capability-map',
    name: 'Capability Map',
    description: 'High-level capability map (strategy layer).',
    allowedElementTypes: ['Capability', 'Outcome', 'Goal', 'Resource', 'CourseOfAction'],
    allowedRelationshipTypes: ['Association', 'Influence', 'Realization', 'Composition', 'Aggregation']
  },
  {
    id: 'application-cooperation',
    name: 'Application Cooperation View',
    description: 'How application components/services cooperate and exchange information.',
    allowedElementTypes: ['ApplicationComponent', 'ApplicationService', 'DataObject'],
    allowedRelationshipTypes: ['Serving', 'Flow', 'Association', 'Realization', 'Access']
  },
  {
    id: 'uml-class',
    name: 'UML Class Diagram',
    description: 'UML class diagram (v1).',
    allowedElementTypes: ['uml.class', 'uml.interface', 'uml.enum', 'uml.package', 'uml.note'],
    allowedRelationshipTypes: [
      'uml.association',
      'uml.aggregation',
      'uml.composition',
      'uml.generalization',
      'uml.realization',
      'uml.dependency'
    ]
  },
  {
    id: 'bpmn-process',
    name: 'BPMN Process',
    description: 'BPMN process/collaboration diagram (v2: pools/lanes + message flow).',
    allowedElementTypes: ['bpmn.pool', 'bpmn.lane', 'bpmn.task', 'bpmn.startEvent', 'bpmn.endEvent', 'bpmn.gatewayExclusive'],
    allowedRelationshipTypes: ['bpmn.sequenceFlow', 'bpmn.messageFlow']
  }
];

export function getViewpointById(id: string): Viewpoint | undefined {
  return VIEWPOINTS.find((vp) => vp.id === id);
}
