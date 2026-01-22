export type LayoutDirection = 'RIGHT' | 'DOWN';

export type EdgeRoutingStyle = 'POLYLINE' | 'ORTHOGONAL';

export type AutoLayoutScope = 'all' | 'selection';

// Arrange / alignment utilities.
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export type DistributeMode = 'horizontal' | 'vertical';

export type SameSizeMode = 'width' | 'height' | 'both';

export interface AutoLayoutOptions {
  /**
   * Layout direction for layered layouts.
   * - RIGHT: left-to-right
   * - DOWN: top-to-bottom
   */
  direction?: LayoutDirection;

  /**
   * Desired minimum spacing between nodes (in view coordinates/pixels).
   * Implementation may use this as a hint.
   */
  spacing?: number;

  /**
   * Preferred edge routing style. (Your diagram router can still re-route after layout.)
   */
  edgeRouting?: EdgeRoutingStyle;

  /**
   * Scope of auto layout. If 'selection' is requested but the caller does not supply
   * selection context, implementations may treat it as 'all'.
   */
  scope?: AutoLayoutScope;

  /**
   * If true, nodes marked as locked/pinned should not be moved by the layout engine.
   */
  respectLocked?: boolean;
}

export interface LayoutNodeInput {
  id: string;
  width: number;
  height: number;
  /**
   * If true, the node should be treated as fixed (not moved) by the layout algorithm.
   */
  locked?: boolean;
  /**
   * Optional grouping key (e.g., swimlane, package, layer group).
   */
  groupId?: string;
  /**
   * Optional hint for layered/grouped layouts (e.g., 'business'|'application'|'technology').
   */
  layerHint?: string;
}

export interface LayoutEdgeInput {
  id: string;
  sourceId: string;
  targetId: string;
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
