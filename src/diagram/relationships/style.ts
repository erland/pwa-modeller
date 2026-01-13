export type LinePattern = 'solid' | 'dashed' | 'dotted';

export type MarkerKind =
  | 'none'
  | 'arrowOpen'
  | 'arrowFilled'
  | 'triangleOpen'
  | 'triangleFilled'
  | 'diamondOpen'
  | 'diamondFilled'
  | 'circleOpen'
  | 'circleFilled';

export type RelationshipStyle = {
  markerStart?: MarkerKind;
  markerEnd?: MarkerKind;
  /**
   * Either choose a semantic pattern (preferred) or provide a custom dasharray.
   * If both are provided, dasharray wins.
   */
  line?: {
    pattern?: LinePattern;
    dasharray?: string;
  };
  /** Optional label rendered near the relationship mid point (e.g. Influence strength). */
  midLabel?: string;
};

export function dasharrayForPattern(pattern?: LinePattern): string | undefined {
  if (!pattern || pattern === 'solid') return undefined;
  if (pattern === 'dashed') return '6 5';
  return '2 4';
}
