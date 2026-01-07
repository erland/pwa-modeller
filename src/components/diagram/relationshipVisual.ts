import type { RelationshipType } from '../../domain';

export type RelationshipVisual = {
  markerStart?: string;
  markerEnd?: string;
  dasharray?: string;
  /** Optional label rendered around the mid point of the polyline. */
  midLabel?: string;
};

export function relationshipVisual(
  rel: { type: RelationshipType; attrs?: { isDirected?: boolean; accessType?: string; influenceStrength?: string } },
  isSelected: boolean
): RelationshipVisual {
  const suffix = isSelected ? 'Sel' : '';

  const accessType = (rel.attrs?.accessType ?? '').trim();
  const influenceStrength = (rel.attrs?.influenceStrength ?? '').trim();

  switch (rel.type) {
    case 'Association':
      // ArchiMate 3.1+ supports directed associations.
      return rel.attrs?.isDirected ? { markerEnd: `url(#arrowOpen${suffix})` } : {};
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
                : undefined,
      };
    case 'Influence':
      return {
        markerEnd: `url(#arrowOpen${suffix})`,
        dasharray: '2 4',
        midLabel: influenceStrength || '±',
      };
    default:
      return { markerEnd: `url(#arrowOpen${suffix})` };
  }
}
