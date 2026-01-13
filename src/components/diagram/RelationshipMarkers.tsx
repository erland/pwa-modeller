import { MARKER_DEFS, markerId } from '../../diagram/relationships/markers';

function markerStrokeVar(selected: boolean): string {
  return selected ? 'var(--diagram-rel-stroke-selected)' : 'var(--diagram-rel-stroke)';
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
              orient="auto"
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
              orient="auto"
            >
              <path d={def.pathD} {...pathSelProps} />
            </marker>
          </g>
        );
      })}
    </defs>
  );
}
