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
  }
];

export function getViewpointById(id: string): Viewpoint | undefined {
  return VIEWPOINTS.find(vp => vp.id === id);
}
