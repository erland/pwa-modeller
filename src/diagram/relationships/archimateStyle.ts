import type { RelationshipType } from '../../domain';
import type { RelationshipStyle } from './style';


type ArchimateRelAttrs = {
  isDirected?: boolean;
  accessType?: string;
  influenceStrength?: string;
};

function normalizeArchimateAttrs(attrs: unknown): ArchimateRelAttrs {
  if (!attrs || typeof attrs !== 'object') return {};
  const a = attrs as Record<string, unknown>;
  const isDirected = typeof a.isDirected === 'boolean' ? a.isDirected : undefined;
  const accessType = typeof a.accessType === 'string' ? a.accessType : undefined;
  const influenceStrength = typeof a.influenceStrength === 'string' ? a.influenceStrength : undefined;
  return { isDirected, accessType, influenceStrength };;
}

export function archimateRelationshipStyle(rel: {
  type: RelationshipType;
  // attrs is intentionally untyped at the diagram/notation boundary; we normalize what we need here.
  attrs?: unknown;
}): RelationshipStyle {
  const a = normalizeArchimateAttrs(rel.attrs);
  const accessType = (a.accessType ?? '').trim();
  const influenceStrength = (a.influenceStrength ?? '').trim();
  switch (rel.type) {
    case 'Association':
      // ArchiMate 3.1+ supports directed associations.
      return a.isDirected ? { markerEnd: 'arrowOpen' } : {};
    case 'Composition':
      return { markerStart: 'diamondFilled' };
    case 'Aggregation':
      return { markerStart: 'diamondOpen' };
    case 'Specialization':
      return { markerEnd: 'triangleOpen' };
    case 'Realization':
      return { markerEnd: 'triangleOpen', line: { pattern: 'dashed' } };
    case 'Serving':
      return { markerEnd: 'arrowOpen', line: { pattern: 'dashed' } };
    case 'Flow':
      return { markerEnd: 'arrowOpen', line: { pattern: 'dashed' } };
    case 'Triggering':
      return { markerEnd: 'arrowOpen' };
    case 'Assignment':
      return { markerEnd: 'arrowFilled' };
    case 'Access':
      return {
        markerEnd: 'arrowOpen',
        midLabel:
          accessType === 'Read' ? 'R' : accessType === 'Write' ? 'W' : accessType === 'ReadWrite' ? 'RW' : undefined,
      };
    case 'Influence':
      return {
        markerEnd: 'arrowOpen',
        line: { pattern: 'dotted' },
        midLabel: influenceStrength || '±',
      };
    default:
      return { markerEnd: 'arrowOpen' };
  }
}