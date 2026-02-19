import { MARKER_DEFS, markerId } from '../../diagram/relationships/markers';

function markerStrokeVar(selected: boolean): string {
  return selected ? 'var(--diagram-rel-stroke-selected)' : 'var(--diagram-rel-stroke)';
}

function markerOrient(kind: string): string {
  // Ensure arrowheads at the start of an edge point *into* the start point.
  // This matches UML navigability semantics when using markerStart.
  return kind.startsWith('arrow') || kind.startsWith('triangle') ? 'auto-start-reverse' : 'auto';
}

export function RelationshipMarkers() {
  return (
    <defs>
      {MARKER_DEFS.map((def) => {
        const pathBaseProps = def.isFilled
          ? { fill: markerStrokeVar(false) }
          : {
              fill: 'none',
              stroke: markerStrokeVar(false),
              strokeWidth: def.strokeWidth ?? 1.6,
              strokeLinejoin: def.strokeLinejoin ?? 'round',
            };

        const pathSelProps = def.isFilled
          ? { fill: markerStrokeVar(true) }
          : {
              fill: 'none',
              stroke: markerStrokeVar(true),
              strokeWidth: def.strokeWidth ?? 1.6,
              strokeLinejoin: def.strokeLinejoin ?? 'round',
            };

        const id = markerId(def.kind, false)!;
        const idSel = markerId(def.kind, true)!;

        return (
          <g key={def.kind}>
            <marker
              id={id}
              viewBox={def.viewBox}
              refX={def.refX}
              refY={def.refY}
              markerWidth={def.markerWidth}
              markerHeight={def.markerHeight}
              orient={markerOrient(def.kind)}
            >
              <path d={def.pathD} {...pathBaseProps} />
            </marker>
            <marker
              id={idSel}
              viewBox={def.viewBox}
              refX={def.refX}
              refY={def.refY}
              markerWidth={def.markerWidth}
              markerHeight={def.markerHeight}
              orient={markerOrient(def.kind)}
            >
              <path d={def.pathD} {...pathSelProps} />
            </marker>
          </g>
        );
      })}
    </defs>
  );
}
