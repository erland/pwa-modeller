import type { MetricDefinition } from './types';

/**
 * Registry of metrics that ship with the app.
 *
 * The UI can use this to populate dropdowns/toggles.
 */
export const BUILT_IN_METRICS: MetricDefinition[] = [
  {
    id: 'nodeDegree',
    label: 'Degree',
    target: 'node',
    description: 'Number of adjacent relationships for each node (direction-aware).'
  },
  {
    id: 'nodeReach',
    label: 'Reach (depth N)',
    target: 'node',
    description: 'Number of distinct nodes reachable within N hops (direction-aware).'
  },
  {
    id: 'nodePropertyNumber',
    label: 'Property (number)',
    target: 'node',
    description: 'Numeric value read from a tagged value or notation-specific property.'
  },
  {
    id: 'matrixRelationshipCount',
    label: 'Relationship count',
    target: 'matrixCell',
    description: 'Number of relationships in each matrix cell.'
  },
  {
    id: 'matrixWeightedCount',
    label: 'Weighted count',
    target: 'matrixCell',
    description: 'Sum of relationship-type weights for each matrix cell.'
  }
];
