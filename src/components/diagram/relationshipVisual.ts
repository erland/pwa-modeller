import type { RelationshipType } from '../../domain';

export type RelationshipVisual = {
  markerStart?: string;
  markerEnd?: string;
  dasharray?: string;
  /** Optional label rendered around the mid point of the polyline. */
  midLabel?: string;
};

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
  return { isDirected, accessType, influenceStrength };
}

export function relationshipVisual(
  rel: { type: RelationshipType; attrs?: unknown },
  isSelected: boolean
): RelationshipVisual {
  const suffix = isSelected ? 'Sel' : '';

  // Relationship visuals here are ArchiMate-oriented. For non-ArchiMate types
  // we fall back to a simple arrow by default (notation-specific styling can override elsewhere).
  if (typeof rel.type === 'string' && (rel.type.startsWith('uml.') || rel.type.startsWith('bpmn.'))) {
    return { markerEnd: `url(#arrowOpen${suffix})` };
  }

  const a = normalizeArchimateAttrs(rel.attrs);
  const accessType = (a.accessType ?? '').trim();
  const influenceStrength = (a.influenceStrength ?? '').trim();

  switch (rel.type) {
    case 'Association':
      // ArchiMate 3.1+ supports directed associations.
      return a.isDirected ? { markerEnd: `url(#arrowOpen${suffix})` } : {};
    case 'Composition':
      return { markerStart: `url(#diamondFilled${suffix})` };
    case 'Aggregation':
      return { markerStart: `url(#diamondOpen${suffix})` };
    case 'Specialization':
      return { markerEnd: `url(#triangleOpen${suffix})` };
    case 'Realization':
      return { markerEnd: `url(#triangleOpen${suffix})`, dasharray: '6 5' };
    case 'Serving':
      return { markerEnd: `url(#arrowOpen${suffix})`, dasharray: '6 5' };
    case 'Flow':
      return { markerEnd: `url(#arrowOpen${suffix})`, dasharray: '6 5' };
    case 'Triggering':
      return { markerEnd: `url(#arrowOpen${suffix})` };
    case 'Assignment':
      return { markerEnd: `url(#arrowFilled${suffix})` };
    case 'Access':
      // Keep the default access visual (open arrow). Optionally show a compact access-mode label.
      return {
        markerEnd: `url(#arrowOpen${suffix})`,
        midLabel:
          accessType === 'Read'
            ? 'R'
            : accessType === 'Write'
              ? 'W'
              : accessType === 'ReadWrite'
                ? 'RW'
                : undefined
      };
    case 'Influence':
      return {
        markerEnd: `url(#arrowOpen${suffix})`,
        dasharray: '2 4',
        midLabel: influenceStrength || '±'
      };
    default:
      return { markerEnd: `url(#arrowOpen${suffix})` };
  }
}
