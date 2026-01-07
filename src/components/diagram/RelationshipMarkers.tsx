export function RelationshipMarkers() {
  return (
    <defs>
                        {/* Open arrow (dependency/triggering/flow/serving/access/influence) */}
                        <marker id="arrowOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                          <path
                            d="M 0 0 L 10 5 L 0 10"
                            fill="none"
                            stroke="var(--diagram-rel-stroke)"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                        </marker>
                        <marker id="arrowOpenSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                          <path
                            d="M 0 0 L 10 5 L 0 10"
                            fill="none"
                            stroke="var(--diagram-rel-stroke-selected)"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                        </marker>

                        {/* Filled arrow (assignment) */}
                        <marker id="arrowFilled" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--diagram-rel-stroke)" />
                        </marker>
                        <marker id="arrowFilledSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--diagram-rel-stroke-selected)" />
                        </marker>

                        {/* Open triangle (realization/specialization) */}
                        <marker id="triangleOpen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                          <path
                            d="M 0 0 L 10 5 L 0 10 z"
                            fill="none"
                            stroke="var(--diagram-rel-stroke)"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                        </marker>
                        <marker id="triangleOpenSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                          <path
                            d="M 0 0 L 10 5 L 0 10 z"
                            fill="none"
                            stroke="var(--diagram-rel-stroke-selected)"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                        </marker>

                        {/* Diamonds (composition/aggregation) at the source side */}
                        <marker id="diamondOpen" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                          <path
                            d="M 0 5 L 5 0 L 10 5 L 5 10 z"
                            fill="none"
                            stroke="var(--diagram-rel-stroke)"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                        </marker>
                        <marker id="diamondOpenSel" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                          <path
                            d="M 0 5 L 5 0 L 10 5 L 5 10 z"
                            fill="none"
                            stroke="var(--diagram-rel-stroke-selected)"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                        </marker>

                        <marker id="diamondFilled" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                          <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--diagram-rel-stroke)" />
                        </marker>
                        <marker id="diamondFilledSel" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="10" markerHeight="10" orient="auto">
                          <path d="M 0 5 L 5 0 L 10 5 L 5 10 z" fill="var(--diagram-rel-stroke-selected)" />
                        </marker>
                      </defs>
  );
}
