export type LayoutDirection = 'RIGHT' | 'DOWN';

export type EdgeRoutingStyle = 'POLYLINE' | 'ORTHOGONAL';

export type AutoLayoutScope = 'all' | 'selection';

export interface AutoLayoutOptions {
  /**
   * Layout direction for layered layouts.
   * - RIGHT: left-to-right
   * - DOWN: top-to-bottom
   */
  direction?: LayoutDirection;

  /**
   * Desired minimum spacing between nodes (in view coordinates/pixels).
   */
  spacing?: number;

  /**
   * Desired edge routing style. Note: some engines may treat this as a hint.
   */
  edgeRouting?: EdgeRoutingStyle;

  /**
   * Scope of auto layout.
   */
  scope?: AutoLayoutScope;

  /**
   * If true, nodes marked as locked should keep their positions.
   */
  respectLocked?: boolean;
}

export interface LayoutNodeInput {
  id: string;
  width: number;
  height: number;
  locked?: boolean;

  /**
   * Optional grouping/container identifier (e.g., lanes, groups).
   */
  groupId?: string;

  /**
   * Optional semantic hint for placing nodes into bands/layers (e.g., business/application/technology).
   */
  layerHint?: string;
}

export interface LayoutEdgeInput {
  id: string;
  source: string;
  target: string;

  /**
   * Optional weight/priority (higher means "more important" for the layout).
   */
  weight?: number;
}

export interface LayoutInput {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
}

export interface LayoutOutput {
  positions: Record<string, { x: number; y: number }>;
}
